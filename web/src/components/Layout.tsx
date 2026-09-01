import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

const LABEL_PERFIL: Record<string, string> = {
  colaborador: 'Colaborador',
  coordenador: 'Coordenador',
  rh: 'RH',
}

export default function Layout({ children }: { children: ReactNode }) {
  const { perfil, signOut } = useAuth()

  return (
    <div className="layout">
      <header className="topo">
        <div>
          <strong>Horas Extras</strong>
          {perfil && (
            <span className="badge-perfil">{LABEL_PERFIL[perfil.perfil]}</span>
          )}
        </div>
        <div className="topo-usuario">
          {perfil && <span>{perfil.nome}</span>}
          <button className="link" onClick={() => signOut()}>
            Sair
          </button>
        </div>
      </header>
      <main className="conteudo">{children}</main>
    </div>
  )
}
