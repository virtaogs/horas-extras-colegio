import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { MOTIVOS, type Lancamento } from '../lib/types'

const TEXTO_ACEITE =
  'Declaro que as informações acima são verdadeiras e que a hora extra foi previamente combinada com minha coordenação.'
const VERSAO_TEXTO_ACEITE = 'v1'

const LABEL_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

export default function ColaboradorPage() {
  const { session, perfil } = useAuth()
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [data, setData] = useState('')
  const [horaEntrada, setHoraEntrada] = useState('')
  const [horaSaida, setHoraSaida] = useState('')
  const [motivo, setMotivo] = useState('')
  const [motivoOutro, setMotivoOutro] = useState('')
  const [destino, setDestino] = useState<'banco_horas' | 'folha'>('banco_horas')
  const [aceite, setAceite] = useState(false)

  async function carregarLancamentos() {
    setCarregando(true)
    const { data: rows, error } = await supabase
      .from('lancamentos')
      .select('*')
      .order('data_hora_extra', { ascending: false })
    if (error) setErro(error.message)
    else setLancamentos(rows as Lancamento[])
    setCarregando(false)
  }

  useEffect(() => {
    carregarLancamentos()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(null)

    if (!perfil || !session) return
    if (!aceite) {
      setErro('É preciso aceitar a declaração antes de enviar.')
      return
    }
    if (motivo === 'outro' && motivoOutro.trim().length === 0) {
      setErro('Descreva o motivo quando escolher "Outro".')
      return
    }

    setEnviando(true)

    const { data: novoLancamento, error: erroInsert } = await supabase
      .from('lancamentos')
      .insert({
        colaborador_id: perfil.id,
        data_hora_extra: data,
        hora_entrada: horaEntrada,
        hora_saida: horaSaida,
        motivo,
        motivo_outro_texto: motivo === 'outro' ? motivoOutro.trim() : null,
        destino,
        origem: 'colaborador',
      })
      .select()
      .single()

    if (erroInsert || !novoLancamento) {
      setErro(erroInsert?.message ?? 'Erro ao enviar lançamento.')
      setEnviando(false)
      return
    }

    const { error: erroAceite } = await supabase.from('aceites').insert({
      lancamento_id: novoLancamento.id,
      texto_aceito: TEXTO_ACEITE,
      versao_texto: VERSAO_TEXTO_ACEITE,
      user_id: session.user.id,
    })

    if (erroAceite) {
      setErro('Lançamento enviado, mas houve um erro ao registrar o aceite: ' + erroAceite.message)
    } else {
      setSucesso('Lançamento enviado com sucesso.')
    }

    setData('')
    setHoraEntrada('')
    setHoraSaida('')
    setMotivo('')
    setMotivoOutro('')
    setDestino('banco_horas')
    setAceite(false)
    setEnviando(false)
    carregarLancamentos()
  }

  return (
    <div className="pagina">
      <section className="cartao">
        <h2>Lançar hora extra</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Data
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </label>
          <label>
            Hora de entrada
            <input
              type="time"
              value={horaEntrada}
              onChange={(e) => setHoraEntrada(e.target.value)}
              required
            />
          </label>
          <label>
            Hora de saída
            <input
              type="time"
              value={horaSaida}
              onChange={(e) => setHoraSaida(e.target.value)}
              required
            />
          </label>
          <label>
            Motivo
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} required>
              <option value="" disabled>
                Selecione…
              </option>
              {MOTIVOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {motivo === 'outro' && (
            <label className="span-2">
              Descreva o motivo
              <input
                type="text"
                value={motivoOutro}
                onChange={(e) => setMotivoOutro(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            Destino
            <select value={destino} onChange={(e) => setDestino(e.target.value as any)}>
              <option value="banco_horas">Banco de horas</option>
              <option value="folha">Folha de pagamento</option>
            </select>
          </label>

          <label className="checkbox span-2">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            {TEXTO_ACEITE}
          </label>

          {erro && <p className="erro span-2">{erro}</p>}
          {sucesso && <p className="sucesso span-2">{sucesso}</p>}

          <button type="submit" className="span-2" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar lançamento'}
          </button>
        </form>
      </section>

      <section className="cartao">
        <h2>Meus lançamentos</h2>
        {carregando ? (
          <p>Carregando…</p>
        ) : lancamentos.length === 0 ? (
          <p>Nenhum lançamento ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Horário</th>
                <th>Motivo</th>
                <th>Destino</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id}>
                  <td>{l.data_hora_extra}</td>
                  <td>
                    {l.hora_entrada}–{l.hora_saida}
                  </td>
                  <td>{MOTIVOS.find((m) => m.value === l.motivo)?.label ?? l.motivo}</td>
                  <td>{l.destino === 'banco_horas' ? 'Banco de horas' : 'Folha'}</td>
                  <td>
                    <span className={`status status-${l.status}`}>{LABEL_STATUS[l.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
