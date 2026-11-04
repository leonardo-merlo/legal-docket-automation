import { describe, test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsearPauta } from './parser.ts'

// A pauta real tem nome, CPF e processo de cliente: fica em .fixtures-privadas/,
// fora do git. Sem ela (outra máquina), este arquivo só registra o pulo.
const PASTA = join(process.cwd(), '.fixtures-privadas')
const ARQUIVO_TEXTO = join(PASTA, 'pauta-15-06-26.txt')
const ARQUIVO_ESPERADO = join(PASTA, 'pauta-15-06-26.esperado.json')

interface Esperado {
  assunto: string
  loteId: string
  totalBlocos: number
  totalFint: number
  totalValidos: number
  cnjsUnicos: number
  repetidos: Record<string, number[]>
  segundaInstancia: string[]
  poloPassivoEmDuasLinhas: { cnj: string; poloPassivo: string }
}

if (!existsSync(ARQUIVO_TEXTO) || !existsSync(ARQUIVO_ESPERADO)) {
  test.skip('pauta real de 15/06/2026 (fixture ausente em .fixtures-privadas/)', () => {})
} else {
  const esperado = JSON.parse(readFileSync(ARQUIVO_ESPERADO, 'utf8')) as Esperado
  const resultado = parsearPauta(esperado.assunto, readFileSync(ARQUIVO_TEXTO, 'utf8'))
  const porCnj = new Map(resultado.processos.map((p) => [p.numeroCnj, p]))

  describe('pauta real de 15/06/2026', () => {
    test('lê 52 blocos, 20 FINT e 32 válidos', () => {
      assert.equal(resultado.totalBlocos, esperado.totalBlocos)
      assert.equal(resultado.totalFint, esperado.totalFint)
      assert.equal(resultado.totalValidos, esperado.totalValidos)
    })

    test('encontra 29 CNJs únicos e fecha com os totais declarados', () => {
      assert.equal(resultado.processos.length, esperado.cnjsUnicos)
      assert.equal(resultado.status, 'ok')
    })

    test('usa o lote 15/06/2026', () => {
      assert.equal(resultado.loteId, esperado.loteId)
    })

    test('marca os 3 repetidos com as publicações certas', () => {
      for (const [cnj, publicacoes] of Object.entries(esperado.repetidos)) {
        assert.deepEqual(porCnj.get(cnj)?.publicacoes, publicacoes)
      }
    })

    test('classifica as câmaras do TJMG como pje_2g', () => {
      for (const cnj of esperado.segundaInstancia) {
        assert.equal(porCnj.get(cnj)?.sistema, 'pje_2g')
      }
    })

    test('emenda o polo passivo quebrado em duas linhas', () => {
      const { cnj, poloPassivo } = esperado.poloPassivoEmDuasLinhas
      assert.equal(porCnj.get(cnj)?.poloPassivo, poloPassivo)
    })

    test('nenhum processo fica sem sistema', () => {
      assert.deepEqual(resultado.processos.filter((p) => p.sistema === null).map((p) => p.numeroPublicacao), [])
    })
  })
}
