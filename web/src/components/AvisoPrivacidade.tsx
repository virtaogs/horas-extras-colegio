import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export const VERSAO_PRIVACIDADE = 'v1'

const TEXTO_PRIVACIDADE = `
Este sistema registra dados de colaboradores do colégio para controle e
aprovação de horas extras.

DADOS COLETADOS
Nome completo, CPF (usado como identificador de acesso), cargo, setor,
coordenador responsável, e os lançamentos de hora extra (data, horário de
entrada e saída, motivo, destino — banco de horas ou folha — e o status da
aprovação). Também é registrado quem consultou os dados de qual colaborador
e quando (log de acesso), e o histórico de decisões de cada lançamento.

PARA QUE SERVEM
Justificar, aprovar e controlar horas extras, e apurar seu pagamento ou
lançamento em banco de horas — como camada complementar ao ponto
eletrônico, que segue sendo o registro oficial de jornada.

QUEM TEM ACESSO
O próprio colaborador (aos seus dados), o coordenador responsável (aos
dados da sua equipe) e o RH (a todos os dados, para fins de gestão,
folha e auditoria).

POR QUANTO TEMPO
Os registros são mantidos pelo período legalmente exigido para documentos
trabalhistas (padrão: 5 anos), podendo ser anonimizados após o desligamento
do colaborador, respeitado esse prazo.

BASE LEGAL
O tratamento destes dados se baseia no cumprimento de obrigação legal e na
execução do contrato de trabalho (art. 7º, incisos II e V, da Lei Geral de
Proteção de Dados), e não depende do seu consentimento individual — ainda
assim, registramos a ciência abaixo para sua transparência.
`.trim()

export default function AvisoPrivacidade({ onAceitar }: { onAceitar: () => void }) {
  const { session } = useAuth()
  const [marcado, setMarcado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function aceitar() {
    if (!session) return
    setEnviando(true)
    setErro(null)
    const { error } = await supabase.from('aceites_privacidade').insert({
      user_id: session.user.id,
      texto_aceito: TEXTO_PRIVACIDADE,
      versao_texto: VERSAO_PRIVACIDADE,
    })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    onAceitar()
  }

  return (
    <div className="tela-cheia">
      <div className="cartao cartao-privacidade">
        <h1>Aviso de privacidade</h1>
        <div className="texto-privacidade">
          {TEXTO_PRIVACIDADE.split('\n\n').map((par, i) => (
            <p key={i}>{par}</p>
          ))}
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} />
          Li e estou ciente das informações acima.
        </label>

        {erro && <p className="erro">{erro}</p>}

        <button onClick={aceitar} disabled={!marcado || enviando}>
          {enviando ? 'Registrando…' : 'Continuar'}
        </button>
      </div>
    </div>
  )
}

export function usePrivacidadeAceita(userId: string | undefined) {
  const [status, setStatus] = useState<'carregando' | 'pendente' | 'aceito'>('carregando')

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    supabase
      .from('aceites_privacidade')
      .select('id')
      .eq('versao_texto', VERSAO_PRIVACIDADE)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return
        setStatus(data ? 'aceito' : 'pendente')
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  return { status, marcarAceito: () => setStatus('aceito') }
}
