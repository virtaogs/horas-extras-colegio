import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { MeuPerfil } from '../lib/types'

interface AuthState {
  session: Session | null
  perfil: MeuPerfil | null
  loading: boolean
  erroPerfil: boolean
  signIn: (email: string, senha: string) => Promise<string | null>
  signOut: () => Promise<void>
  recarregarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<MeuPerfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [erroPerfil, setErroPerfil] = useState(false)

  // Depois que o projeto Supabase sai de pausa (plano gratuito), a
  // primeira consulta pode falhar por lentidão de "esquentar" — por
  // isso tenta de novo algumas vezes antes de assumir que a pessoa
  // realmente não tem perfil vinculado.
  async function carregarPerfil() {
    setErroPerfil(false)
    const tentativas = [0, 1200, 2500]
    for (let i = 0; i < tentativas.length; i++) {
      if (tentativas[i] > 0) await esperar(tentativas[i])
      const { data, error } = await supabase.rpc('meu_perfil').maybeSingle()
      if (!error) {
        setPerfil((data as MeuPerfil) ?? null)
        return
      }
      console.error(`Erro ao carregar perfil (tentativa ${i + 1}):`, error)
    }
    setPerfil(null)
    setErroPerfil(true)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await carregarPerfil()
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        await carregarPerfil()
      } else {
        setPerfil(null)
        setErroPerfil(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) return error.message
    return null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ session, perfil, loading, erroPerfil, signIn, signOut, recarregarPerfil: carregarPerfil }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
