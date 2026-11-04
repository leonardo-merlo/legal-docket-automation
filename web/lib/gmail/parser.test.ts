import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { extrairLoteId, identificarSistema, parsearPauta, type SistemaProcesso } from './parser.ts'

const CNJ_PJE = '5000001-11.2099.8.13.0001'
const CNJ_EPROC = '1000002-22.2099.8.13.0001'
const CNJ_TRF6 = '6000003-33.2099.4.06.0001'
const CNJ_DESCONHECIDO = '9000004-44.2099.8.13.0001'

interface OpcoesBloco {
  tribunal?: string
  vara?: string | null
  cidade?: string
  corpo: string
}

function bloco(numero: number, opcoes: OpcoesBloco): string {
  const linhas = [
    `Publicação: ${numero}.`,
    '',
    'Data de Disponibilização: 01/01/2099',
    `Tribunal: ${opcoes.tribunal ?? 'DJEN - Diário de Justiça Eletrônico Nacional - TJMG'}`,
  ]
  if (opcoes.cidade) linhas.push(`Cidade: ${opcoes.cidade}`)
  if (opcoes.vara !== null) linhas.push(`Vara: ${opcoes.vara ?? '1ª Vara Cível da Comarca de Cidade Teste'}`)
  linhas.push('Título: Intimação', 'Publicação: Intimação', '', opcoes.corpo, '', '')
  return linhas.join('\n')
}

function corpoPadrao(cnj: string): string {
  return [
    `PROCESSO: ${cnj} - PROCEDIMENTO COMUM CiVEL - || texto do ato |||`,
    'POLO ATIVO: FULANO DE TAL',
    'ADVOGADO: ADVOGADO FICTICIO - OAB: 000001/MG',
  ].join('\n')
}

function ler(blocos: string[], totais: { corpo?: number; assunto?: number } = {}) {
  const assunto = `ENC: Recorte Digital OAB/MG - Pauta MG 01/01/99, DJ 01/01/99 - total ${totais.assunto ?? blocos.length} publicações.`
  const corpo = [
    'opa',
    '',
    'Recorte Digital - OAB - Resultado da Busca',
    '',
    ...blocos,
    `Total de Publicações: ${totais.corpo ?? blocos.length}`,
    '',
  ].join('\n')
  return parsearPauta(assunto, corpo)
}

describe('lote da pauta', () => {
  test('usa a 1ª data do assunto e completa o ano de 2 dígitos', () => {
    assert.equal(extrairLoteId('ENC: Recorte Digital OAB/MG - Pauta MG 15/06/26, DJ 16/06/26 - total 3 publicações.'), '15/06/2026')
  })

  test('aceita ano com 4 dígitos', () => {
    assert.equal(extrairLoteId('RES: Pauta MG 01/09/2026, DJ 02/09/2026'), '01/09/2026')
  })

  test('devolve null quando o assunto não tem data', () => {
    assert.equal(extrairLoteId('Fwd: Recorte Digital'), null)
  })
})

describe('divisão em blocos', () => {
  test('abre um bloco por "Publicação: N." e ignora "Publicação: Intimação"', () => {
    const resultado = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) }), bloco(2, { corpo: corpoPadrao(CNJ_EPROC) })])
    assert.equal(resultado.totalBlocos, 2)
    assert.deepEqual(resultado.processos.map((p) => p.numeroPublicacao), [1, 2])
  })

  test('descarta bloco FINT de todas as contagens', () => {
    const resultado = ler([
      bloco(1, { tribunal: 'FINT', vara: '2º JUIZADO ESPECIAL DA COMARCA DE X', corpo: `00060 - ${CNJ_TRF6}` }),
      bloco(2, { corpo: corpoPadrao(CNJ_PJE) }),
    ])
    assert.equal(resultado.totalFint, 1)
    assert.equal(resultado.totalValidos, 1)
    assert.deepEqual(resultado.processos.map((p) => p.numeroCnj), [CNJ_PJE])
  })

  test('pula bloco sem CNJ e avisa', () => {
    const resultado = ler([bloco(1, { corpo: 'sem número de processo' }), bloco(2, { corpo: corpoPadrao(CNJ_PJE) })])
    assert.equal(resultado.totalSemCnj, 1)
    assert.ok(resultado.avisos.some((aviso) => aviso.startsWith('Publicação 1: sem número CNJ')))
  })
})

describe('campos do processo', () => {
  test('separa "X da Comarca de Y" em vara e comarca', () => {
    const [processo] = ler([bloco(1, { vara: '2ª Vara Cível da Comarca de Cidade Teste', corpo: corpoPadrao(CNJ_PJE) })]).processos
    assert.equal(processo.vara, '2ª Vara Cível')
    assert.equal(processo.comarca, 'Cidade Teste')
  })

  test('sem "da Comarca de", a vara é a linha inteira e a comarca vem de Cidade:', () => {
    const vara = 'Cartório da 1ª Câmara Cível – Praça Teste'
    const [processo] = ler([bloco(1, { vara, cidade: 'Cidade Teste', corpo: corpoPadrao(CNJ_PJE) })]).processos
    assert.equal(processo.vara, vara)
    assert.equal(processo.comarca, 'Cidade Teste')
  })

  test('junta vários POLO ATIVO com " | "', () => {
    const corpo = `PROCESSO: ${CNJ_PJE} - X - ||\nPOLO ATIVO: FULANO DE TAL\nPOLO ATIVO: BELTRANO DE TAL\nPOLO PASSIVO: EMPRESA FICTICIA`
    const [processo] = ler([bloco(1, { corpo })]).processos
    assert.equal(processo.poloAtivo, 'FULANO DE TAL | BELTRANO DE TAL')
  })

  test('emenda ao POLO PASSIVO a linha que continua o nome', () => {
    const corpo = `PROCESSO: ${CNJ_PJE} - X - ||\nPOLO ATIVO: FULANO DE TAL\nPOLO PASSIVO: BANCO FICTICIO\nCONSIGNADO S.A.\nADVOGADO: ADVOGADO FICTICIO - OAB: 1/MG`
    const [processo] = ler([bloco(1, { corpo })]).processos
    assert.equal(processo.poloPassivo, 'BANCO FICTICIO CONSIGNADO S.A.')
    assert.equal(processo.poloAtivo, 'FULANO DE TAL')
  })

  test('sem POLO PASSIVO, o campo fica null', () => {
    const [processo] = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) })]).processos
    assert.equal(processo.poloPassivo, null)
  })

  test('lê a classe do CLASSE: sem o [CÍVEL] e sem o (7)', () => {
    const corpo = `PROCESSO: ${CNJ_PJE} - OUTRA - || x |||\nPROCESSO Nº: ${CNJ_PJE}\nCLASSE: [CÍVEL] PROCEDIMENTO COMUM CÍVEL (7) FULANO DE TAL CPF: 000`
    const [processo] = ler([bloco(1, { corpo })]).processos
    assert.equal(processo.classeProcessual, 'PROCEDIMENTO COMUM CÍVEL')
  })

  test('sem CLASSE:, lê a classe entre o CNJ e o || da linha PROCESSO:', () => {
    const [processo] = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) })]).processos
    assert.equal(processo.classeProcessual, 'PROCEDIMENTO COMUM CiVEL')
  })
})

describe('sistema do processo', () => {
  const casos: { descricao: string; cnj: string; vara: string | null; esperado: SistemaProcesso | null }[] = [
    { descricao: 'vara + dígito 1 = eProc TJMG', cnj: CNJ_EPROC, vara: '1ª Vara Cível da Comarca de X', esperado: 'eproc_tjmg' },
    { descricao: 'vara + dígito 5 = PJe', cnj: CNJ_PJE, vara: 'Vara Única da Comarca de X', esperado: 'pje' },
    { descricao: 'vara + dígito 6 = eProc TRF6', cnj: CNJ_TRF6, vara: 'Vara Cível e JEF Adjunto de X', esperado: 'eproc_trf6' },
    { descricao: 'câmara do TJMG = 2ª instância', cnj: CNJ_PJE, vara: 'TJMG - 10ª CÂMARA CÍVEL', esperado: 'pje_2g' },
    { descricao: 'cartório de câmara = 2ª instância', cnj: CNJ_PJE, vara: 'Cartório da 14ª Câmara Cível – Praça Teste', esperado: 'pje_2g' },
    { descricao: 'juizado especial é 1ª instância', cnj: CNJ_PJE, vara: '2º JUIZADO ESPECIAL DA COMARCA DE X', esperado: 'pje' },
    { descricao: 'sem linha Vara, vale o dígito', cnj: CNJ_EPROC, vara: null, esperado: 'eproc_tjmg' },
    { descricao: 'dígito desconhecido = null', cnj: CNJ_DESCONHECIDO, vara: '1ª Vara Cível', esperado: null },
  ]
  for (const caso of casos) {
    test(`classifica: ${caso.descricao}`, () => {
      assert.equal(identificarSistema(caso.cnj, caso.vara), caso.esperado)
    })
  }

  test('avisa quando o sistema não é identificado', () => {
    const resultado = ler([bloco(1, { corpo: corpoPadrao(CNJ_DESCONHECIDO) })])
    assert.ok(resultado.avisos.some((aviso) => aviso.includes('sistema não identificado')))
  })
})

describe('CNJ repetido na pauta', () => {
  test('anota "Duplicado na pauta: Nx, publicações A, B" e fica com o número do último bloco', () => {
    const resultado = ler([
      bloco(1, { corpo: corpoPadrao(CNJ_PJE) }),
      bloco(2, { corpo: corpoPadrao(CNJ_EPROC) }),
      bloco(3, { corpo: corpoPadrao(CNJ_PJE) }),
    ])
    const repetido = resultado.processos.find((p) => p.numeroCnj === CNJ_PJE)
    assert.equal(repetido?.observacoes, 'Duplicado na pauta: 2x, publicações 1, 3')
    assert.equal(repetido?.numeroPublicacao, 3)
    assert.equal(resultado.processos.find((p) => p.numeroCnj === CNJ_EPROC)?.observacoes, null)
  })

  test('o último bloco define os campos, e campo vazio nele herda do anterior', () => {
    const resultado = ler([
      bloco(1, { corpo: corpoPadrao(CNJ_PJE) }),
      bloco(2, { vara: '2ª Vara Cível da Comarca de Outra Cidade', corpo: `PROCESSO: ${CNJ_PJE} - X - ||` }),
    ])
    const [processo] = resultado.processos
    assert.equal(processo.vara, '2ª Vara Cível')
    assert.equal(processo.poloAtivo, 'FULANO DE TAL')
  })

  test('bloco FINT não conta como repetição', () => {
    const resultado = ler([
      bloco(1, { tribunal: 'FINT', corpo: `00060 - ${CNJ_PJE}` }),
      bloco(2, { corpo: corpoPadrao(CNJ_PJE) }),
    ])
    assert.equal(resultado.processos[0].observacoes, null)
  })
})

describe('conferência dos totais', () => {
  test('status ok quando blocos, corpo e assunto batem', () => {
    const resultado = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) }), bloco(2, { corpo: corpoPadrao(CNJ_EPROC) })])
    assert.equal(resultado.status, 'ok')
    assert.equal(resultado.totalDeclaradoCorpo, 2)
    assert.equal(resultado.totalDeclaradoAssunto, 2)
  })

  test('status divergente quando o corpo declara outro total', () => {
    const resultado = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) })], { corpo: 4 })
    assert.equal(resultado.status, 'divergente')
    assert.ok(resultado.avisos.includes('1 blocos lidos, mas o corpo declara 4.'))
  })

  test('status sem_cnj quando nenhum bloco tem CNJ', () => {
    const resultado = ler([bloco(1, { corpo: 'nada aqui' })])
    assert.equal(resultado.status, 'sem_cnj')
  })

  test('pauta só de FINT sai ok, não sem_cnj', () => {
    const resultado = ler([
      bloco(1, { tribunal: 'FINT', corpo: `00060 - ${CNJ_TRF6}` }),
      bloco(2, { tribunal: 'FINT', corpo: `00061 - ${CNJ_TRF6}` }),
    ])
    assert.equal(resultado.totalValidos, 0)
    assert.equal(resultado.status, 'ok')
  })

  test('grava o lote da pauta', () => {
    assert.equal(ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) })]).loteId, '01/01/2099')
  })
})
