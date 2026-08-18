import { FormEvent, ReactNode, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, AtSign, Eye, EyeOff, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { isBackendConfigured, supabase } from './lib/supabase';
import { requestPasswordReset, signIn, signUp } from './lib/auth';
import toxitySymbol from '../assets/brand/svg/toxity-symbol.svg';

type Mode = 'login' | 'register' | 'reset';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [preview, setPreview] = useState(!isBackendConfigured);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isBackendConfigured && !preview) return <AuthScreen onPreview={() => setPreview(true)} setupOnly />;
  if (!isBackendConfigured && preview) return <><div className="preview-banner"><ShieldCheck size={15} /> Prévia local — configure o Supabase e LiveKit para usar dados reais</div>{children}</>;
  if (!session) return <AuthScreen onPreview={() => setPreview(true)} />;
  return children;
}

function AuthScreen({ onPreview, setupOnly = false }: { onPreview: () => void; setupOnly?: boolean }) {
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    const values = new FormData(event.currentTarget);
    try {
      const email = String(values.get('email') ?? '').trim();
      if (mode === 'reset') {
        await requestPasswordReset(email); setMessage('Enviamos um link seguro para redefinir sua senha.');
      } else if (mode === 'register') {
        await signUp(email, String(values.get('password')), String(values.get('displayName')), String(values.get('nametag')));
        setMessage('Conta criada. Confirme seu e-mail para entrar.');
      } else await signIn(email, String(values.get('password')));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir.'); }
    finally { setLoading(false); }
  }

  return <main className="auth-shell">
    <section className="auth-story">
      <img src={toxitySymbol} alt="Toxity" />
      <span className="eyebrow">CONVERSAS QUE ACONTECEM</span>
      <h1>Entre na mesma sintonia.</h1>
      <p>Chame seus amigos, compartilhe o que está vendo e transforme qualquer grupo em um lugar vivo.</p>
      <div className="story-orbits"><span /><span /><span /></div>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <div className="auth-mobile-brand"><img src={toxitySymbol} alt="" /><strong>Toxity</strong></div>
        <span className="eyebrow">{mode === 'register' ? 'SUA IDENTIDADE' : mode === 'reset' ? 'RECUPERAR ACESSO' : 'BEM-VINDO DE VOLTA'}</span>
        <h2>{setupOnly ? 'Conecte o backend' : mode === 'register' ? 'Crie seu espaço' : mode === 'reset' ? 'Defina uma nova senha' : 'Continue de onde parou'}</h2>
        {setupOnly ? <><p className="auth-description">Copie <code>.env.example</code> para <code>.env</code> e adicione as credenciais públicas do Supabase.</p><button className="auth-submit" onClick={onPreview}>Abrir prévia local <ArrowRight size={18} /></button></> : <form onSubmit={submit}>
          {mode === 'register' && <div className="auth-row"><Field icon={<UserRound />} name="displayName" label="Nome" placeholder="Como quer ser chamado?" /><Field icon={<AtSign />} name="nametag" label="Nametag" placeholder="seu_nametag" pattern="[a-zA-Z0-9_]{3,20}" /></div>}
          <Field icon={<Mail />} name="email" label="E-mail" placeholder="voce@email.com" type="email" />
          {mode !== 'reset' && <label className="auth-field"><span>Senha</span><div><KeyRound /><input name="password" type={showPassword ? 'text' : 'password'} placeholder="No mínimo 8 caracteres" minLength={8} required /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>}
          {error && <p className="auth-error">{error}</p>}{message && <p className="auth-success">{message}</p>}
          <button className="auth-submit" disabled={loading}>{loading ? 'Aguarde…' : mode === 'register' ? 'Criar conta' : mode === 'reset' ? 'Enviar link seguro' : 'Entrar'}<ArrowRight size={18} /></button>
        </form>}
        {!setupOnly && <div className="auth-links">{mode === 'login' && <button onClick={() => setMode('reset')}>Esqueci minha senha</button>}<button onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Já tenho uma conta' : 'Criar uma conta'}</button></div>}
      </div>
    </section>
  </main>;
}

function Field({ icon, label, ...input }: { icon: ReactNode; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="auth-field"><span>{label}</span><div>{icon}<input {...input} required /></div></label>;
}
