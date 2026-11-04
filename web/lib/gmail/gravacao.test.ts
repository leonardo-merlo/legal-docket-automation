import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoPublicacaoIgnorada, decidirGravacao, ehDataDeLote, loteDepoisDoCorte } from './gravacao.ts'
import type { ProcessoDaPauta } from './parser.ts'

const HOJE = new Date('2026-09-10T15:00:00Z')

function processo(campos: Partial<ProcessoDaPauta> = {}): ProcessoDaPauta {
  return {
    numeroCnj: '5000001-11.2099.8.13.0001',
    numeroPublicacao: 3,
    publicacoes: [3],
    vara: '1ª Vara Cível',
    comarca: 'Cidade Teste',
    poloAtivo: 'FULANO DE TAL',
    poloPassivo: null,
    classeProcessual: 'PROCEDIMENTO COMUM CÍVEL',
    sistema: 'pje',
    observacoes: null,
    ...campos,
  }
}

const CONTEXTO = { loteId: '09/09/2026', emailId: 'email-1' }

describe('aviso de publicação nova em processo tratado na mão', () => {
  test('escreve a data da pauta em DD/MM/AAAA', () => {
    assert.equal(
      avisoPublicacaoIgnorada('2026-08-19', null, HOJE),
      'Publicação nova em 19/08/2026 — processo tratado na mão, não voltou para a fila.',
    )
  })

  test('aceita lote que já vem em DD/MM/AAAA', () => {
    assert.ok(avisoPublicacaoIgnorada('19/08/2026', null, HOJE).includes('19/08/2026'))
  })

  test('põe a pauta mais recente em cima', () => {
    const antigo = avisoPublicacaoIgnorada('18/08/2026', null, HOJE)
    const [primeira, segunda] = avisoPublicacaoIgnorada('19/08/2026', antigo, HOJE).split('\n')
    assert.ok(primeira.includes('19/08/2026'))
    assert.ok(segunda.includes('18/08/2026'))
  })

  test('não repete a mesma pauta', () => {
    const uma = avisoPublicacaoIgnorada('19/08/2026', null, HOJE)
    assert.equal(avisoPublicacaoIgnorada('19/08/2026', uma, HOJE), uma)
  })

  test('guarda no máximo 10 linhas', () => {
    let texto: string | null = null
    for (let dia = 1; dia <= 15; dia++) {
      texto = avisoPublicacaoIgnorada(`${String(dia).padStart(2, '0')}/07/2026`, texto, HOJE)
    }
    assert.equal(texto?.split('\n').length, 10)
  })

  test('o limite de 10 linhas nunca corta anotação escrita à mão', () => {
    let texto: string | null = 'anotação escrita à mão'
    for (let dia = 1; dia <= 15; dia++) {
      texto = avisoPublicacaoIgnorada(`${String(dia).padStart(2, '0')}/07/2026`, texto, HOJE)
    }
    assert.ok(texto?.endsWith('\nanotação escrita à mão'))
  })

  test('mantém a anotação escrita à mão embaixo do aviso', () => {
    assert.ok(avisoPublicacaoIgnorada('19/08/2026', 'anotação escrita à mão', HOJE).endsWith('\nanotação escrita à mão'))
  })

  test('sem lote, usa a data de hoje em Brasília', () => {
    assert.ok(avisoPublicacaoIgnorada(null, null, HOJE).includes('10/09/2026'))
  })
})

describe('decisão de gravação', () => {
  test('tratado na mão: só escreve o aviso e não mexe no status', () => {
    const gravacao = decidirGravacao(processo(), { pje_status: 'tratado_manual', observacoes: null }, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo, 'avisar_tratado_manual')
  })

  test('processado volta para pendente sem virar duplicata', () => {
    const gravacao = decidirGravacao(processo(), { pje_status: 'processado', observacoes: null }, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo, 'atualizar')
    if (gravacao.tipo !== 'atualizar') return
    assert.equal(gravacao.dados.pje_status, 'pendente')
    assert.equal(gravacao.dados.duplicata, false)
  })

  test('CNJ novo é inserido', () => {
    assert.equal(decidirGravacao(processo(), undefined, CONTEXTO, HOJE).tipo, 'inserir')
  })

  test('campo que a publicação não trouxe não apaga o do banco', () => {
    const gravacao = decidirGravacao(processo({ vara: null }), undefined, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo, 'inserir')
    if (gravacao.tipo !== 'inserir') return
    assert.equal('vara' in gravacao.dados, false)
  })

  test('campo vazio não apaga o do banco numa atualização', () => {
    const gravacao = decidirGravacao(processo({ vara: null }), { pje_status: 'processado', observacoes: null }, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo, 'atualizar')
    if (gravacao.tipo !== 'atualizar') return
    assert.equal('vara' in gravacao.dados, false)
  })

  test('atualizar não apaga observacoes', () => {
    const gravacao = decidirGravacao(processo({ observacoes: null }), { pje_status: 'processado', observacoes: 'anotação' }, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo, 'atualizar')
    if (gravacao.tipo !== 'atualizar') return
    assert.equal('observacoes' in gravacao.dados, false)
  })

  test('atualizar sem lote não apaga lote_id', () => {
    const gravacao = decidirGravacao(processo(), { pje_status: 'processado', observacoes: null }, { loteId: null, emailId: 'email-1' }, HOJE)
    assert.equal(gravacao.tipo, 'atualizar')
    if (gravacao.tipo !== 'atualizar') return
    assert.equal('lote_id' in gravacao.dados, false)
  })

  test('grava fonte gmail_api e todos os números do processo repetido na pauta', () => {
    const repetido = processo({ publicacoes: [1, 3], observacoes: 'Duplicado na pauta: 2x, publicações 1, 3' })
    const gravacao = decidirGravacao(repetido, undefined, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo, 'inserir')
    if (gravacao.tipo !== 'inserir') return
    assert.deepEqual([gravacao.dados.fonte, gravacao.dados.numero_publicacao], ['gmail_api', '1, 3'])
  })

  test('não grava a nota de duplicado nas observações', () => {
    const repetido = processo({ publicacoes: [1, 3], observacoes: 'Duplicado na pauta: 2x, publicações 1, 3' })
    const gravacao = decidirGravacao(repetido, { pje_status: 'processado', observacoes: null }, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo === 'atualizar' && 'observacoes' in gravacao.dados, false)
  })
})

describe('corte da ativação', () => {
  test('09/09/2026 vem depois de 08/09/2026', () => {
    assert.equal(loteDepoisDoCorte('09/09/2026', '08/09/2026'), true)
  })

  test('compara como data, não como texto: 31/08/2026 vem antes de 08/09/2026', () => {
    assert.equal(loteDepoisDoCorte('31/08/2026', '08/09/2026'), false)
  })

  test('o próprio dia do corte não passa', () => {
    assert.equal(loteDepoisDoCorte('08/09/2026', '08/09/2026'), false)
  })

  test('sem lote não passa do corte', () => {
    assert.equal(loteDepoisDoCorte(null, '08/09/2026'), false)
  })

  test('reconhece data de lote válida', () => {
    assert.equal(ehDataDeLote('08/09/2026'), true)
    assert.equal(ehDataDeLote('2026-09-08'), false)
  })

  test('recusa data impossível', () => {
    assert.equal(ehDataDeLote('31/02/2026'), false)
    assert.equal(ehDataDeLote('99/99/2026'), false)
    assert.equal(ehDataDeLote('29/02/2028'), true)
  })
})
