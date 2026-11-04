export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agentes: {
        Row: {
          criado_em: string
          id: string
          nome: string
          usuario_windows: string | null
          visto_em: string
        }
        Insert: {
          criado_em?: string
          id: string
          nome: string
          usuario_windows?: string | null
          visto_em?: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome?: string
          usuario_windows?: string | null
          visto_em?: string
        }
        Relationships: []
      }
      checklist_itens: {
        Row: {
          concluido: boolean
          concluido_em: string | null
          concluido_por_id: string | null
          criado_em: string
          id: string
          ordem: number
          rascunho_id: string
          texto: string
        }
        Insert: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por_id?: string | null
          criado_em?: string
          id?: string
          ordem: number
          rascunho_id: string
          texto: string
        }
        Update: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por_id?: string | null
          criado_em?: string
          id?: string
          ordem?: number
          rascunho_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_itens_concluido_por_id_fkey"
            columns: ["concluido_por_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_itens_rascunho_id_fkey"
            columns: ["rascunho_id"]
            isOneToOne: false
            referencedRelation: "rascunhos"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists_modelo: {
        Row: {
          atualizado_em: string
          passos: string[]
          status: string
          validado: boolean
        }
        Insert: {
          atualizado_em?: string
          passos?: string[]
          status: string
          validado?: boolean
        }
        Update: {
          atualizado_em?: string
          passos?: string[]
          status?: string
          validado?: boolean
        }
        Relationships: []
      }
      comandos: {
        Row: {
          acao: string
          atualizado_em: string
          computador: string | null
          criado_em: string
          id: string
          mensagem: string | null
          status: string
        }
        Insert: {
          acao?: string
          atualizado_em?: string
          computador?: string | null
          criado_em?: string
          id?: string
          mensagem?: string | null
          status?: string
        }
        Update: {
          acao?: string
          atualizado_em?: string
          computador?: string | null
          criado_em?: string
          id?: string
          mensagem?: string | null
          status?: string
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          atualizado_em: string | null
          chave: string
          descricao: string | null
          id: string
          valor: string
        }
        Insert: {
          atualizado_em?: string | null
          chave: string
          descricao?: string | null
          id?: string
          valor: string
        }
        Update: {
          atualizado_em?: string | null
          chave?: string
          descricao?: string | null
          id?: string
          valor?: string
        }
        Relationships: []
      }
      documentos: {
        Row: {
          cargo: string | null
          data_documento: string | null
          data_extracao: string | null
          erro: string | null
          id: string
          indice: number
          juntado_por: string | null
          numero_documento: string | null
          processo_id: string
          texto: string | null
          titulo: string | null
          url_iframe: string | null
        }
        Insert: {
          cargo?: string | null
          data_documento?: string | null
          data_extracao?: string | null
          erro?: string | null
          id?: string
          indice: number
          juntado_por?: string | null
          numero_documento?: string | null
          processo_id: string
          texto?: string | null
          titulo?: string | null
          url_iframe?: string | null
        }
        Update: {
          cargo?: string | null
          data_documento?: string | null
          data_extracao?: string | null
          erro?: string | null
          id?: string
          indice?: number
          juntado_por?: string | null
          numero_documento?: string | null
          processo_id?: string
          texto?: string | null
          titulo?: string | null
          url_iframe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      emails_recebidos: {
        Row: {
          conferencia_processos_errados: number | null
          conferencia_comentario: string | null
          conferencia_status: string | null
          conferido_em: string | null
          conferido_por_id: string | null
          aplicacao_status: string | null
          aplicado_em: string | null
          assunto: string | null
          corpo_texto: string | null
          data_processamento: string | null
          data_recebimento: string
          erro: string | null
          gmail_message_id: string | null
          id: string
          lote_id: string | null
          modo: string | null
          parser_resultado: Json | null
          parser_status: string | null
          parser_versao: string | null
          remetente: string
          total_blocos: number | null
          total_cnj: number | null
          total_declarado: number | null
          total_declarado_assunto: number | null
          total_fint: number | null
          total_validos: number | null
        }
        Insert: {
          conferencia_processos_errados?: number | null
          conferencia_comentario?: string | null
          conferencia_status?: string | null
          conferido_em?: string | null
          conferido_por_id?: string | null
          aplicacao_status?: string | null
          aplicado_em?: string | null
          assunto?: string | null
          corpo_texto?: string | null
          data_processamento?: string | null
          data_recebimento: string
          erro?: string | null
          gmail_message_id?: string | null
          id?: string
          lote_id?: string | null
          modo?: string | null
          parser_resultado?: Json | null
          parser_status?: string | null
          parser_versao?: string | null
          remetente: string
          total_blocos?: number | null
          total_cnj?: number | null
          total_declarado?: number | null
          total_declarado_assunto?: number | null
          total_fint?: number | null
          total_validos?: number | null
        }
        Update: {
          conferencia_processos_errados?: number | null
          conferencia_comentario?: string | null
          conferencia_status?: string | null
          conferido_em?: string | null
          conferido_por_id?: string | null
          aplicacao_status?: string | null
          aplicado_em?: string | null
          assunto?: string | null
          corpo_texto?: string | null
          data_processamento?: string | null
          data_recebimento?: string
          erro?: string | null
          gmail_message_id?: string | null
          id?: string
          lote_id?: string | null
          modo?: string | null
          parser_resultado?: Json | null
          parser_status?: string | null
          parser_versao?: string | null
          remetente?: string
          total_blocos?: number | null
          total_cnj?: number | null
          total_declarado?: number | null
          total_declarado_assunto?: number | null
          total_fint?: number | null
          total_validos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_recebidos_conferido_por_id_fkey"
            columns: ["conferido_por_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_extracao: {
        Row: {
          comando_id: string | null
          dados: Json | null
          detalhe: string | null
          etapa: string
          id: number
          momento: string
          numero_cnj: string | null
          ok: boolean
          sistema: string | null
        }
        Insert: {
          comando_id?: string | null
          dados?: Json | null
          detalhe?: string | null
          etapa: string
          id?: number
          momento?: string
          numero_cnj?: string | null
          ok?: boolean
          sistema?: string | null
        }
        Update: {
          comando_id?: string | null
          dados?: Json | null
          detalhe?: string | null
          etapa?: string
          id?: number
          momento?: string
          numero_cnj?: string | null
          ok?: boolean
          sistema?: string | null
        }
        Relationships: []
      }
      integracao_gmail: {
        Row: {
          atualizado_em: string
          conectado_em: string
          conectado_por: string | null
          email_conectado: string
          id: number
          refresh_token_cifrado: string
          status: string
          ultima_sincronizacao_em: string | null
          ultima_sincronizacao_ok_em: string | null
          ultimo_erro: string | null
          ultimo_erro_em: string | null
        }
        Insert: {
          atualizado_em?: string
          conectado_em?: string
          conectado_por?: string | null
          email_conectado: string
          id?: number
          refresh_token_cifrado: string
          status?: string
          ultima_sincronizacao_em?: string | null
          ultima_sincronizacao_ok_em?: string | null
          ultimo_erro?: string | null
          ultimo_erro_em?: string | null
        }
        Update: {
          atualizado_em?: string
          conectado_em?: string
          conectado_por?: string | null
          email_conectado?: string
          id?: number
          refresh_token_cifrado?: string
          status?: string
          ultima_sincronizacao_em?: string | null
          ultima_sincronizacao_ok_em?: string | null
          ultimo_erro?: string | null
          ultimo_erro_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integracao_gmail_conectado_por_fkey"
            columns: ["conectado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      processos: {
        Row: {
          classe_processual: string | null
          comarca: string | null
          data_ajuizamento: string | null
          data_criacao: string | null
          data_entrada: string | null
          data_ultima_consulta: string | null
          duplicata: boolean | null
          duracao_extracao_s: number | null
          email_id: string | null
          fonte: string | null
          id: string
          lote_id: string | null
          motivo_ignorado: string | null
          numero_cnj: string
          numero_publicacao: string | null
          observacoes: string | null
          pje_status: string | null
          polo_ativo: string | null
          polo_passivo: string | null
          proxima_acao: string | null
          responsavel_id: string | null
          sistema: string | null
          status_atual: string | null
          tipo: string | null
          total_documentos: number | null
          vara: string | null
        }
        Insert: {
          classe_processual?: string | null
          comarca?: string | null
          data_ajuizamento?: string | null
          data_criacao?: string | null
          data_entrada?: string | null
          data_ultima_consulta?: string | null
          duplicata?: boolean | null
          duracao_extracao_s?: number | null
          email_id?: string | null
          fonte?: string | null
          id?: string
          lote_id?: string | null
          motivo_ignorado?: string | null
          numero_cnj: string
          numero_publicacao?: string | null
          observacoes?: string | null
          pje_status?: string | null
          polo_ativo?: string | null
          polo_passivo?: string | null
          proxima_acao?: string | null
          responsavel_id?: string | null
          sistema?: string | null
          status_atual?: string | null
          tipo?: string | null
          total_documentos?: number | null
          vara?: string | null
        }
        Update: {
          classe_processual?: string | null
          comarca?: string | null
          data_ajuizamento?: string | null
          data_criacao?: string | null
          data_entrada?: string | null
          data_ultima_consulta?: string | null
          duplicata?: boolean | null
          duracao_extracao_s?: number | null
          email_id?: string | null
          fonte?: string | null
          id?: string
          lote_id?: string | null
          motivo_ignorado?: string | null
          numero_cnj?: string
          numero_publicacao?: string | null
          observacoes?: string | null
          pje_status?: string | null
          polo_ativo?: string | null
          polo_passivo?: string | null
          proxima_acao?: string | null
          responsavel_id?: string | null
          sistema?: string | null
          status_atual?: string | null
          tipo?: string | null
          total_documentos?: number | null
          vara?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails_recebidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      publicacoes: {
        Row: {
          criada_em: string
          duplicata: boolean
          duracao_extracao_s: number | null
          email_id: string | null
          id: string
          motivo_ignorado: string | null
          numero_publicacao: string | null
          pauta: string
          pje_status: string | null
          processo_id: string
        }
        Insert: {
          criada_em?: string
          duplicata?: boolean
          duracao_extracao_s?: number | null
          email_id?: string | null
          id?: string
          motivo_ignorado?: string | null
          numero_publicacao?: string | null
          pauta: string
          pje_status?: string | null
          processo_id: string
        }
        Update: {
          criada_em?: string
          duplicata?: boolean
          duracao_extracao_s?: number | null
          email_id?: string | null
          id?: string
          motivo_ignorado?: string | null
          numero_publicacao?: string | null
          pauta?: string
          pje_status?: string | null
          processo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publicacoes_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails_recebidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publicacoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      rascunhos: {
        Row: {
          publicacao_id: string | null
          alerta: string | null
          campos_editados_manualmente: string[]
          cenario_prazo: string | null
          checklist_editado: boolean
          classificacao_risco: string | null
          custo_usd: number | null
          data_criacao: string | null
          data_extracao: string | null
          data_revisao: string | null
          documentos_analisados: number | null
          documentos_enviados_modelo: number | null
          editado_manualmente_em: string | null
          id: string
          justificativa: string | null
          modelo_ia: string | null
          prazo_fatal_dias_uteis: number | null
          prazo_interno_dias_uteis: number | null
          processo_id: string
          proxima_acao: string | null
          responsavel_sugerido: string | null
          responsavel_sugerido_id: string | null
          status: string | null
          status_sugerido: string | null
          tokens_entrada: number | null
          tokens_saida: number | null
        }
        Insert: {
          publicacao_id?: string | null
          alerta?: string | null
          campos_editados_manualmente?: string[]
          cenario_prazo?: string | null
          checklist_editado?: boolean
          classificacao_risco?: string | null
          custo_usd?: number | null
          data_criacao?: string | null
          data_extracao?: string | null
          data_revisao?: string | null
          documentos_analisados?: number | null
          documentos_enviados_modelo?: number | null
          editado_manualmente_em?: string | null
          id?: string
          justificativa?: string | null
          modelo_ia?: string | null
          prazo_fatal_dias_uteis?: number | null
          prazo_interno_dias_uteis?: number | null
          processo_id: string
          proxima_acao?: string | null
          responsavel_sugerido?: string | null
          responsavel_sugerido_id?: string | null
          status?: string | null
          status_sugerido?: string | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
        }
        Update: {
          publicacao_id?: string | null
          alerta?: string | null
          campos_editados_manualmente?: string[]
          cenario_prazo?: string | null
          checklist_editado?: boolean
          classificacao_risco?: string | null
          custo_usd?: number | null
          data_criacao?: string | null
          data_extracao?: string | null
          data_revisao?: string | null
          documentos_analisados?: number | null
          documentos_enviados_modelo?: number | null
          editado_manualmente_em?: string | null
          id?: string
          justificativa?: string | null
          modelo_ia?: string | null
          prazo_fatal_dias_uteis?: number | null
          prazo_interno_dias_uteis?: number | null
          processo_id?: string
          proxima_acao?: string | null
          responsavel_sugerido?: string | null
          responsavel_sugerido_id?: string | null
          status?: string | null
          status_sugerido?: string | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rascunhos_publicacao_id_fkey"
            columns: ["publicacao_id"]
            isOneToOne: false
            referencedRelation: "publicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rascunhos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rascunhos_responsavel_sugerido_id_fkey"
            columns: ["responsavel_sugerido_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      revisoes_rascunho: {
        Row: {
          acao: string
          alteracoes: Json
          comentario: string | null
          criado_em: string
          id: string
          motivos: string[]
          processo_id: string
          rascunho_id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          alteracoes?: Json
          comentario?: string | null
          criado_em?: string
          id?: string
          motivos?: string[]
          processo_id: string
          rascunho_id: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          alteracoes?: Json
          comentario?: string | null
          criado_em?: string
          id?: string
          motivos?: string[]
          processo_id?: string
          rascunho_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revisoes_rascunho_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisoes_rascunho_rascunho_id_fkey"
            columns: ["rascunho_id"]
            isOneToOne: false
            referencedRelation: "rascunhos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisoes_rascunho_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_encaminhamentos: {
        Row: {
          criado_em: string
          de_responsavel_id: string | null
          encaminhada_por_id: string
          id: string
          para_responsavel_id: string
          processo_id: string | null
          tarefa_id: string
        }
        Insert: {
          criado_em?: string
          de_responsavel_id?: string | null
          encaminhada_por_id: string
          id?: string
          para_responsavel_id: string
          processo_id?: string | null
          tarefa_id: string
        }
        Update: {
          criado_em?: string
          de_responsavel_id?: string | null
          encaminhada_por_id?: string
          id?: string
          para_responsavel_id?: string
          processo_id?: string | null
          tarefa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_encaminhamentos_de_responsavel_id_fkey"
            columns: ["de_responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_encaminhamentos_encaminhada_por_id_fkey"
            columns: ["encaminhada_por_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_encaminhamentos_para_responsavel_id_fkey"
            columns: ["para_responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_encaminhamentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_encaminhamentos_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          concluida_em: string | null
          proxima_acao: string | null
          status_atual: string | null
          encaminhada_em: string | null
          encaminhada_por_id: string | null
          atualizado_em: string | null
          criado_em: string | null
          id: string
          notificado_em: string | null
          observacoes: string | null
          prazo_fatal: string | null
          prazo_interno: string | null
          processo_id: string
          rascunho_id: string
          responsavel_id: string
          status_tarefa: string | null
        }
        Insert: {
          concluida_em?: string | null
          proxima_acao?: string | null
          status_atual?: string | null
          encaminhada_em?: string | null
          encaminhada_por_id?: string | null
          atualizado_em?: string | null
          criado_em?: string | null
          id?: string
          notificado_em?: string | null
          observacoes?: string | null
          prazo_fatal?: string | null
          prazo_interno?: string | null
          processo_id: string
          rascunho_id: string
          responsavel_id: string
          status_tarefa?: string | null
        }
        Update: {
          concluida_em?: string | null
          proxima_acao?: string | null
          status_atual?: string | null
          encaminhada_em?: string | null
          encaminhada_por_id?: string | null
          atualizado_em?: string | null
          criado_em?: string | null
          id?: string
          notificado_em?: string | null
          observacoes?: string | null
          prazo_fatal?: string | null
          prazo_interno?: string | null
          processo_id?: string
          rascunho_id?: string
          responsavel_id?: string
          status_tarefa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_rascunho_id_fkey"
            columns: ["rascunho_id"]
            isOneToOne: false
            referencedRelation: "rascunhos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_encaminhada_por_id_fkey"
            columns: ["encaminhada_por_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          ativo: boolean | null
          auth_user_id: string | null
          criado_em: string | null
          email: string
          id: string
          nome: string
          oab: string | null
          papel: string
        }
        Insert: {
          ativo?: boolean | null
          auth_user_id?: string | null
          criado_em?: string | null
          email: string
          id?: string
          nome: string
          oab?: string | null
          papel: string
        }
        Update: {
          ativo?: boolean | null
          auth_user_id?: string | null
          criado_em?: string | null
          email?: string
          id?: string
          nome?: string
          oab?: string | null
          papel?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buscar_processos_cnj: {
        Args: { busca: string }
        Returns: {
          data_entrada: string
          id: string
          lote_id: string
          numero_cnj: string
          pje_status: string
          polo_ativo: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
