-- ============================================================
-- Schema — Controladoria Exemplo Advogados
-- Exportado do banco em produção em 04/11/2026 (só estrutura, sem dados).
-- Rode o arquivo inteiro de uma vez no SQL Editor de um projeto Supabase novo.
--
-- RLS está ligado em todas as tabelas. Só `agentes` e `eventos_extracao` têm
-- policy de leitura para usuário logado; o resto não tem policy nenhuma, então
-- só o código do servidor (com a service_role) lê e grava.
--
-- Fora deste arquivo: o job do pg_cron que chama POST /api/gmail/sincronizar a
-- cada 15 min (o Bearer fica no Vault) e o conteúdo de `checklists_modelo`.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.eventos_extracao_id_seq;

-- ------------------------------------------------------------
-- Tabelas
-- ------------------------------------------------------------

CREATE TABLE public.usuarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome text NOT NULL,
  email text NOT NULL,
  oab text,
  papel text NOT NULL,
  ativo boolean DEFAULT true,
  criado_em timestamp with time zone DEFAULT now(),
  auth_user_id uuid,
  CONSTRAINT usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT usuarios_auth_user_id_key UNIQUE (auth_user_id),
  CONSTRAINT usuarios_email_key UNIQUE (email),
  CONSTRAINT usuarios_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id),
  CONSTRAINT usuarios_papel_check CHECK ((papel = ANY (ARRAY['gestor'::text, 'advogado'::text, 'estagiario'::text])))
);

CREATE TABLE public.emails_recebidos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  remetente text NOT NULL,
  assunto text,
  data_recebimento timestamp with time zone NOT NULL,
  data_processamento timestamp with time zone DEFAULT now(),
  total_cnj integer DEFAULT 0,
  gmail_message_id text,
  corpo_texto text,
  lote_id text,
  total_blocos integer,
  total_fint integer,
  total_validos integer,
  total_declarado integer,
  total_declarado_assunto integer,
  parser_status text,
  parser_versao text,
  parser_resultado jsonb,
  modo text,
  aplicacao_status text,
  aplicado_em timestamp with time zone,
  erro text,
  conferencia_status text,
  conferencia_comentario text,
  conferido_por_id uuid,
  conferido_em timestamp with time zone,
  conferencia_processos_errados integer,
  CONSTRAINT emails_recebidos_pkey PRIMARY KEY (id),
  CONSTRAINT emails_recebidos_conferido_por_id_fkey FOREIGN KEY (conferido_por_id) REFERENCES usuarios(id),
  CONSTRAINT emails_recebidos_aplicacao_status_check CHECK ((aplicacao_status = ANY (ARRAY['sombra'::text, 'antes_do_corte'::text, 'pendente'::text, 'aplicado'::text, 'erro_aplicacao'::text, 'remetente_nao_autenticado'::text, 'pauta_repetida'::text]))),
  CONSTRAINT emails_recebidos_conferencia_processos_errados_check CHECK ((conferencia_processos_errados >= 0)),
  CONSTRAINT emails_recebidos_conferencia_status_check CHECK ((conferencia_status = ANY (ARRAY['ok'::text, 'com_erro'::text]))),
  CONSTRAINT emails_recebidos_modo_check CHECK ((modo = ANY (ARRAY['sombra'::text, 'ativo'::text]))),
  CONSTRAINT emails_recebidos_parser_status_check CHECK ((parser_status = ANY (ARRAY['ok'::text, 'divergente'::text, 'sem_cnj'::text, 'erro'::text])))
);

CREATE TABLE public.processos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  numero_cnj text NOT NULL,
  vara text,
  comarca text,
  classe_processual text,
  polo_ativo text,
  polo_passivo text,
  status_atual text,
  data_ajuizamento date,
  data_ultima_consulta timestamp with time zone,
  data_criacao timestamp with time zone DEFAULT now(),
  sistema text,
  tipo text,
  pje_status text,
  observacoes text,
  email_id uuid,
  responsavel_id uuid,
  total_documentos integer,
  proxima_acao text,
  fonte text DEFAULT 'manual'::text,
  duplicata boolean DEFAULT false,
  motivo_ignorado text,
  data_entrada timestamp with time zone DEFAULT now(),
  lote_id text,
  numero_publicacao text,
  duracao_extracao_s integer,
  CONSTRAINT processos_pkey PRIMARY KEY (id),
  CONSTRAINT processos_numero_cnj_key UNIQUE (numero_cnj),
  CONSTRAINT processos_email_id_fkey FOREIGN KEY (email_id) REFERENCES emails_recebidos(id),
  CONSTRAINT processos_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id),
  CONSTRAINT processos_pje_status_check CHECK (((pje_status IS NULL) OR (pje_status = ANY (ARRAY['pendente'::text, 'processado'::text, 'ignorado'::text, 'erro_browser'::text, 'captcha_bloqueado'::text, 'tratado_manual'::text])))),
  CONSTRAINT processos_status_atual_check CHECK ((status_atual = ANY (ARRAY['PENDENTE'::text, 'EM_ANDAMENTO'::text, 'ARQUIVADO'::text, 'CONTESTACAO'::text, 'SENTENCA_ACORDO'::text, 'EXECUCAO'::text, 'AGUARDAR'::text, 'MANIFESTAR'::text, 'APELACAO'::text, 'AGRAVO_INSTRUMENTO'::text, 'EMBARGOS_DECLARACAO'::text, 'RECURSO_ESPECIAL'::text, 'RECURSO_EXTRAORDINARIO'::text, 'CONTRARRAZOES'::text, 'CONTRARRAZOES_RECURSO_ADESIVO'::text, 'PETICAO'::text, 'PETICAO_PROVAS'::text, 'COMPROVAR_HIPOSSUFICIENCIA'::text, 'EMENDA_INICIAL'::text, 'JUNTAR_DOCUMENTOS'::text, 'CUMPRIMENTO_SENTENCA'::text, 'CIENCIA'::text, 'ALEGACOES_FINAIS'::text, 'REPLICA'::text])))
);

CREATE TABLE public.publicacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  processo_id uuid NOT NULL,
  pauta date NOT NULL,
  numero_publicacao text,
  email_id uuid,
  criada_em timestamp with time zone DEFAULT now() NOT NULL,
  pje_status text,
  motivo_ignorado text,
  duracao_extracao_s integer,
  duplicata boolean DEFAULT false NOT NULL,
  CONSTRAINT publicacoes_pkey PRIMARY KEY (id),
  CONSTRAINT publicacoes_processo_id_pauta_key UNIQUE (processo_id, pauta),
  CONSTRAINT publicacoes_email_id_fkey FOREIGN KEY (email_id) REFERENCES emails_recebidos(id) ON DELETE SET NULL,
  CONSTRAINT publicacoes_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE
);

CREATE TABLE public.documentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  processo_id uuid NOT NULL,
  indice integer NOT NULL,
  numero_documento text,
  url_iframe text,
  texto text,
  erro text,
  data_extracao timestamp with time zone DEFAULT now(),
  titulo text,
  data_documento text,
  juntado_por text,
  cargo text,
  CONSTRAINT documentos_pkey PRIMARY KEY (id),
  CONSTRAINT documentos_processo_id_indice_key UNIQUE (processo_id, indice),
  CONSTRAINT documentos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id)
);

CREATE TABLE public.rascunhos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  processo_id uuid NOT NULL,
  status_sugerido text,
  prazo_fatal_dias_uteis integer,
  prazo_interno_dias_uteis integer,
  cenario_prazo text,
  justificativa text,
  alerta text,
  status text DEFAULT 'pendente'::text,
  data_revisao timestamp with time zone,
  data_criacao timestamp with time zone DEFAULT now(),
  classificacao_risco text,
  responsavel_sugerido_id uuid,
  proxima_acao text,
  modelo_ia text,
  data_extracao timestamp with time zone,
  documentos_analisados integer,
  documentos_enviados_modelo integer,
  responsavel_sugerido text,
  campos_editados_manualmente text[] DEFAULT '{}'::text[] NOT NULL,
  editado_manualmente_em timestamp with time zone,
  tokens_entrada integer,
  tokens_saida integer,
  custo_usd numeric(10,6),
  checklist_editado boolean DEFAULT false NOT NULL,
  publicacao_id uuid,
  CONSTRAINT rascunhos_pkey PRIMARY KEY (id),
  CONSTRAINT rascunhos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id),
  CONSTRAINT rascunhos_publicacao_id_fkey FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE SET NULL,
  CONSTRAINT rascunhos_responsavel_sugerido_id_fkey FOREIGN KEY (responsavel_sugerido_id) REFERENCES usuarios(id),
  CONSTRAINT rascunhos_cenario_prazo_check CHECK ((cenario_prazo = ANY (ARRAY['EXPLICITO'::text, 'VIA_ARTIGO'::text, 'INFERIDO'::text]))),
  CONSTRAINT rascunhos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'rejeitado'::text]))),
  CONSTRAINT rascunhos_status_sugerido_check CHECK ((status_sugerido = ANY (ARRAY['CONTESTACAO'::text, 'SENTENCA_ACORDO'::text, 'EXECUCAO'::text, 'AGUARDAR'::text, 'MANIFESTAR'::text, 'APELACAO'::text, 'AGRAVO_INSTRUMENTO'::text, 'EMBARGOS_DECLARACAO'::text, 'RECURSO_ESPECIAL'::text, 'RECURSO_EXTRAORDINARIO'::text, 'CONTRARRAZOES'::text, 'CONTRARRAZOES_RECURSO_ADESIVO'::text, 'PETICAO'::text, 'PETICAO_PROVAS'::text, 'COMPROVAR_HIPOSSUFICIENCIA'::text, 'EMENDA_INICIAL'::text, 'JUNTAR_DOCUMENTOS'::text, 'CUMPRIMENTO_SENTENCA'::text, 'CIENCIA'::text, 'ALEGACOES_FINAIS'::text, 'REPLICA'::text])))
);

CREATE TABLE public.checklists_modelo (
  status text NOT NULL,
  passos text[] DEFAULT '{}'::text[] NOT NULL,
  validado boolean DEFAULT false NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT checklists_modelo_pkey PRIMARY KEY (status),
  CONSTRAINT checklists_modelo_status_check CHECK ((status = ANY (ARRAY['CONTESTACAO'::text, 'SENTENCA_ACORDO'::text, 'EXECUCAO'::text, 'AGUARDAR'::text, 'MANIFESTAR'::text, 'APELACAO'::text, 'AGRAVO_INSTRUMENTO'::text, 'EMBARGOS_DECLARACAO'::text, 'RECURSO_ESPECIAL'::text, 'RECURSO_EXTRAORDINARIO'::text, 'CONTRARRAZOES'::text, 'CONTRARRAZOES_RECURSO_ADESIVO'::text, 'PETICAO'::text, 'PETICAO_PROVAS'::text, 'COMPROVAR_HIPOSSUFICIENCIA'::text, 'EMENDA_INICIAL'::text, 'JUNTAR_DOCUMENTOS'::text, 'CUMPRIMENTO_SENTENCA'::text, 'CIENCIA'::text, 'ALEGACOES_FINAIS'::text, 'REPLICA'::text])))
);

CREATE TABLE public.checklist_itens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rascunho_id uuid NOT NULL,
  ordem integer NOT NULL,
  texto text NOT NULL,
  concluido boolean DEFAULT false NOT NULL,
  concluido_em timestamp with time zone,
  concluido_por_id uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT checklist_itens_pkey PRIMARY KEY (id),
  CONSTRAINT checklist_itens_rascunho_ordem_key UNIQUE (rascunho_id, ordem),
  CONSTRAINT checklist_itens_concluido_por_id_fkey FOREIGN KEY (concluido_por_id) REFERENCES usuarios(id),
  CONSTRAINT checklist_itens_rascunho_id_fkey FOREIGN KEY (rascunho_id) REFERENCES rascunhos(id) ON DELETE CASCADE,
  CONSTRAINT checklist_itens_texto_check CHECK ((length(btrim(texto)) > 0))
);

CREATE TABLE public.revisoes_rascunho (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rascunho_id uuid NOT NULL,
  processo_id uuid NOT NULL,
  usuario_id uuid,
  acao text NOT NULL,
  alteracoes jsonb DEFAULT '[]'::jsonb NOT NULL,
  motivos text[] DEFAULT '{}'::text[] NOT NULL,
  comentario text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT revisoes_rascunho_pkey PRIMARY KEY (id),
  CONSTRAINT revisoes_rascunho_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id),
  CONSTRAINT revisoes_rascunho_rascunho_id_fkey FOREIGN KEY (rascunho_id) REFERENCES rascunhos(id) ON DELETE CASCADE,
  CONSTRAINT revisoes_rascunho_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT revisoes_rascunho_acao_check CHECK ((acao = ANY (ARRAY['aprovado'::text, 'editado'::text, 'rejeitado'::text]))),
  CONSTRAINT revisoes_rascunho_motivos_check CHECK ((motivos <@ ARRAY['status'::text, 'responsavel'::text, 'prazo_fatal'::text, 'prazo_interno'::text, 'cenario_prazo'::text, 'proxima_acao'::text, 'justificativa'::text, 'alerta'::text, 'checklist'::text, 'outro'::text])),
  CONSTRAINT revisoes_rascunho_rejeicao_com_motivo_check CHECK (((acao <> 'rejeitado'::text) OR (COALESCE(array_length(motivos, 1), 0) >= 1)))
);

CREATE TABLE public.tarefas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rascunho_id uuid NOT NULL,
  processo_id uuid NOT NULL,
  responsavel_id uuid NOT NULL,
  prazo_fatal date,
  prazo_interno date,
  status_tarefa text DEFAULT 'aberta'::text,
  observacoes text,
  notificado_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  encaminhada_por_id uuid,
  encaminhada_em timestamp with time zone,
  proxima_acao text,
  status_atual text,
  concluida_em timestamp with time zone,
  CONSTRAINT tarefas_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_encaminhada_por_id_fkey FOREIGN KEY (encaminhada_por_id) REFERENCES usuarios(id),
  CONSTRAINT tarefas_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id),
  CONSTRAINT tarefas_rascunho_id_fkey FOREIGN KEY (rascunho_id) REFERENCES rascunhos(id),
  CONSTRAINT tarefas_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id),
  CONSTRAINT tarefas_status_tarefa_check CHECK ((status_tarefa = ANY (ARRAY['aberta'::text, 'concluida'::text, 'revisao'::text])))
);

CREATE TABLE public.tarefa_encaminhamentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  processo_id uuid,
  de_responsavel_id uuid,
  para_responsavel_id uuid NOT NULL,
  encaminhada_por_id uuid NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefa_encaminhamentos_pkey PRIMARY KEY (id),
  CONSTRAINT tarefa_encaminhamentos_de_responsavel_id_fkey FOREIGN KEY (de_responsavel_id) REFERENCES usuarios(id),
  CONSTRAINT tarefa_encaminhamentos_encaminhada_por_id_fkey FOREIGN KEY (encaminhada_por_id) REFERENCES usuarios(id),
  CONSTRAINT tarefa_encaminhamentos_para_responsavel_id_fkey FOREIGN KEY (para_responsavel_id) REFERENCES usuarios(id),
  CONSTRAINT tarefa_encaminhamentos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE,
  CONSTRAINT tarefa_encaminhamentos_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES tarefas(id) ON DELETE CASCADE
);

CREATE TABLE public.comandos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  acao text DEFAULT 'iniciar'::text NOT NULL,
  status text DEFAULT 'pendente'::text NOT NULL,
  mensagem text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  computador text,
  CONSTRAINT comandos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.agentes (
  id text NOT NULL,
  nome text NOT NULL,
  usuario_windows text,
  visto_em timestamp with time zone DEFAULT now() NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT agentes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.eventos_extracao (
  id bigint DEFAULT nextval('eventos_extracao_id_seq'::regclass) NOT NULL,
  momento timestamp with time zone DEFAULT now() NOT NULL,
  comando_id uuid,
  etapa text NOT NULL,
  sistema text,
  numero_cnj text,
  ok boolean DEFAULT true NOT NULL,
  detalhe text,
  dados jsonb,
  CONSTRAINT eventos_extracao_pkey PRIMARY KEY (id)
);

CREATE TABLE public.configuracoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  chave text NOT NULL,
  valor text NOT NULL,
  descricao text,
  atualizado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT configuracoes_pkey PRIMARY KEY (id),
  CONSTRAINT configuracoes_chave_key UNIQUE (chave)
);

CREATE TABLE public.integracao_gmail (
  id smallint DEFAULT 1 NOT NULL,
  email_conectado text NOT NULL,
  refresh_token_cifrado text NOT NULL,
  status text DEFAULT 'conectado'::text NOT NULL,
  ultimo_erro text,
  ultimo_erro_em timestamp with time zone,
  ultima_sincronizacao_em timestamp with time zone,
  ultima_sincronizacao_ok_em timestamp with time zone,
  conectado_por uuid,
  conectado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT integracao_gmail_pkey PRIMARY KEY (id),
  CONSTRAINT integracao_gmail_conectado_por_fkey FOREIGN KEY (conectado_por) REFERENCES usuarios(id),
  CONSTRAINT integracao_gmail_id_check CHECK ((id = 1)),
  CONSTRAINT integracao_gmail_status_check CHECK ((status = ANY (ARRAY['conectado'::text, 'desconectado'::text])))
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------

CREATE INDEX comandos_status_criado_idx ON public.comandos USING btree (status, criado_em);
CREATE INDEX emails_recebidos_data_recebimento_idx ON public.emails_recebidos USING btree (data_recebimento DESC);
CREATE UNIQUE INDEX emails_recebidos_gmail_message_id_key ON public.emails_recebidos USING btree (gmail_message_id);
CREATE INDEX eventos_extracao_comando_idx ON public.eventos_extracao USING btree (comando_id, momento);
CREATE INDEX eventos_extracao_falha_idx ON public.eventos_extracao USING btree (ok, momento DESC) WHERE (ok = false);
CREATE INDEX eventos_extracao_momento_idx ON public.eventos_extracao USING btree (momento DESC);
CREATE INDEX idx_checklist_itens_rascunho ON public.checklist_itens USING btree (rascunho_id, ordem);
CREATE INDEX idx_processos_numero_cnj ON public.processos USING btree (numero_cnj);
CREATE INDEX idx_processos_status ON public.processos USING btree (status_atual);
CREATE INDEX idx_rascunhos_status ON public.rascunhos USING btree (status);
CREATE INDEX idx_revisoes_rascunho_criado ON public.revisoes_rascunho USING btree (criado_em);
CREATE INDEX idx_revisoes_rascunho_rascunho ON public.revisoes_rascunho USING btree (rascunho_id, criado_em);
CREATE INDEX idx_tarefas_prazo_fatal ON public.tarefas USING btree (prazo_fatal);
CREATE INDEX idx_tarefas_responsavel ON public.tarefas USING btree (responsavel_id);
CREATE INDEX processos_email_id_idx ON public.processos USING btree (email_id);
CREATE INDEX publicacoes_pauta_idx ON public.publicacoes USING btree (pauta);
CREATE INDEX rascunhos_publicacao_idx ON public.rascunhos USING btree (publicacao_id);
CREATE INDEX tarefa_encaminhamentos_processo_idx ON public.tarefa_encaminhamentos USING btree (processo_id, criado_em);
CREATE INDEX tarefa_encaminhamentos_tarefa_idx ON public.tarefa_encaminhamentos USING btree (tarefa_id, criado_em);

-- ------------------------------------------------------------
-- Funções
-- ------------------------------------------------------------

-- A pauta (data do Diário) de um processo: vem do lote_id do e-mail; sem ele, a
-- data de entrada no fuso de Brasília.
CREATE OR REPLACE FUNCTION public.pauta_do_processo(p_lote_id text, p_data_entrada timestamp with time zone)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  if p_lote_id ~ '^\d{2}/\d{2}/\d{4}$' then
    return to_date(p_lote_id, 'DD/MM/YYYY');
  elsif p_lote_id ~ '^\d{4}-\d{2}-\d{2}$' then
    return p_lote_id::date;
  end if;
  return (p_data_entrada at time zone 'America/Sao_Paulo')::date;
exception when others then
  return (p_data_entrada at time zone 'America/Sao_Paulo')::date;
end
$function$;

CREATE OR REPLACE FUNCTION public.buscar_processos_cnj(busca text)
 RETURNS TABLE(id uuid, numero_cnj text, polo_ativo text, lote_id text, data_entrada timestamp with time zone, pje_status text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.numero_cnj,
    p.polo_ativo,
    p.lote_id,
    p.data_entrada,
    p.pje_status
  FROM processos p
  WHERE regexp_replace(p.numero_cnj, '[^0-9]', '', 'g')
    ILIKE '%' || regexp_replace(busca, '[^0-9]', '', 'g') || '%'
  ORDER BY p.data_entrada DESC
  LIMIT 20;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sincronizar_publicacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pauta date := public.pauta_do_processo(new.lote_id, new.data_entrada);
  v_pauta_antiga date;
begin
  if v_pauta is null then
    return new;
  end if;

  begin
    if tg_op = 'UPDATE' then
      v_pauta_antiga := public.pauta_do_processo(old.lote_id, old.data_entrada);
      if v_pauta_antiga is distinct from v_pauta then
        -- a publicação anterior fica com o desfecho que teve; se nem chegou a ser
        -- tentada, a análise da nova cobre as duas
        update public.publicacoes
           set pje_status = 'substituida'
         where processo_id = new.id and pauta = v_pauta_antiga and pje_status = 'pendente';
      end if;
    end if;

    insert into public.publicacoes (processo_id, pauta, numero_publicacao, email_id, pje_status, motivo_ignorado, duracao_extracao_s, duplicata)
    values (new.id, v_pauta, new.numero_publicacao, new.email_id, new.pje_status, new.motivo_ignorado, new.duracao_extracao_s, coalesce(new.duplicata, false))
    on conflict (processo_id, pauta) do update set
      numero_publicacao = excluded.numero_publicacao,
      email_id = excluded.email_id,
      pje_status = excluded.pje_status,
      motivo_ignorado = excluded.motivo_ignorado,
      duracao_extracao_s = excluded.duracao_extracao_s,
      duplicata = excluded.duplicata;
  exception when others then
    raise warning 'sincronizar_publicacao falhou para o processo %: %', new.id, sqlerrm;
  end;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.rascunho_da_publicacao_atual()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.publicacao_id is null then
    select pu.id into new.publicacao_id
      from public.publicacoes pu
      join public.processos p on p.id = pu.processo_id
     where pu.processo_id = new.processo_id
       and pu.pauta = public.pauta_do_processo(p.lote_id, p.data_entrada);
  end if;
  return new;
end
$function$;

-- Uma análise nova nunca escreve por cima de um rascunho já analisado: vira uma
-- linha nova, e a antiga fica como estava.
CREATE OR REPLACE FUNCTION public.rascunho_nao_sobrescreve()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.modelo_ia is not null
     and new.data_extracao is distinct from old.data_extracao
     and new.data_extracao is not null then
    insert into public.rascunhos (
      processo_id, status_sugerido, prazo_fatal_dias_uteis, prazo_interno_dias_uteis,
      cenario_prazo, justificativa, alerta, status, classificacao_risco,
      responsavel_sugerido_id, responsavel_sugerido, proxima_acao, modelo_ia,
      data_extracao, documentos_analisados, documentos_enviados_modelo,
      tokens_entrada, tokens_saida, custo_usd)
    values (
      new.processo_id, new.status_sugerido, new.prazo_fatal_dias_uteis, new.prazo_interno_dias_uteis,
      new.cenario_prazo, new.justificativa, new.alerta, 'pendente', new.classificacao_risco,
      new.responsavel_sugerido_id, new.responsavel_sugerido, new.proxima_acao, new.modelo_ia,
      new.data_extracao, new.documentos_analisados, new.documentos_enviados_modelo,
      new.tokens_entrada, new.tokens_saida, new.custo_usd);
    return old;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_checklist_do_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.checklist_itens WHERE rascunho_id = NEW.id;

  INSERT INTO public.checklist_itens (rascunho_id, ordem, texto)
  SELECT NEW.id, passo.ordem, passo.texto
  FROM public.checklists_modelo m,
       LATERAL unnest(m.passos) WITH ORDINALITY AS passo(texto, ordem)
  WHERE m.status = NEW.status_sugerido;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tarefa_marca_conclusao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status_tarefa = 'concluida' and old.status_tarefa is distinct from 'concluida' then
    new.concluida_em := now();
  elsif new.status_tarefa is distinct from 'concluida' then
    new.concluida_em := null;
  end if;
  return new;
end
$function$;

-- ------------------------------------------------------------
-- Gatilhos
-- ------------------------------------------------------------

CREATE TRIGGER processos_sincronizar_publicacao AFTER INSERT OR UPDATE OF lote_id, data_entrada, pje_status, motivo_ignorado, duracao_extracao_s, duplicata, numero_publicacao, email_id ON public.processos FOR EACH ROW EXECUTE FUNCTION sincronizar_publicacao();
CREATE TRIGGER rascunhos_publicacao_ao_criar BEFORE INSERT ON public.rascunhos FOR EACH ROW EXECUTE FUNCTION rascunho_da_publicacao_atual();
CREATE TRIGGER rascunhos_nao_sobrescreve BEFORE UPDATE ON public.rascunhos FOR EACH ROW EXECUTE FUNCTION rascunho_nao_sobrescreve();
CREATE TRIGGER rascunhos_checklist_ao_criar AFTER INSERT ON public.rascunhos FOR EACH ROW WHEN ((new.status_sugerido IS NOT NULL)) EXECUTE FUNCTION aplicar_checklist_do_status();
CREATE TRIGGER rascunhos_checklist_ao_trocar_status AFTER UPDATE OF status_sugerido ON public.rascunhos FOR EACH ROW WHEN (((new.status_sugerido IS DISTINCT FROM old.status_sugerido) AND (new.status_sugerido IS NOT NULL) AND (new.checklist_editado = false))) EXECUTE FUNCTION aplicar_checklist_do_status();
CREATE TRIGGER tarefas_marca_conclusao BEFORE UPDATE OF status_tarefa ON public.tarefas FOR EACH ROW EXECUTE FUNCTION tarefa_marca_conclusao();

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------

ALTER TABLE public.usuarios               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails_recebidos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rascunhos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists_modelo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_itens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revisoes_rascunho      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_encaminhamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comandos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_extracao       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracao_gmail       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados podem ler agentes" ON public.agentes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados podem ler eventos" ON public.eventos_extracao AS PERMISSIVE FOR SELECT TO authenticated USING (true);
