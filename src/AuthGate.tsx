import { FormEvent, ReactNode, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  AtSign,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { isBackendConfigured, supabase } from "./lib/supabase";
import {
  checkNametagAvailability,
  normalizeEmail,
  normalizeNametag,
  passwordError,
  registrationMessage,
  requestPasswordReset,
  resendSignupCode,
  signIn,
  signUp,
  verifySignupCode,
} from "./lib/auth";
import toxitySymbol from "../assets/brand/svg/toxity-symbol.svg";

type Mode = "login" | "register" | "verify" | "reset";
type Registration = { email: string; displayName: string; nametag: string };

const nametagPattern = /^[a-z0-9_]{3,20}$/;

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [preview, setPreview] = useState(!isBackendConfigured);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) =>
      setSession(nextSession),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isBackendConfigured && !preview)
    return <AuthScreen onPreview={() => setPreview(true)} setupOnly />;
  if (!isBackendConfigured && preview)
    return (
      <>
        <div className="preview-banner">
          <ShieldCheck size={15} /> Prévia local — configure o Supabase e
          LiveKit para usar dados reais
        </div>
        {children}
      </>
    );
  if (!session) return <AuthScreen onPreview={() => setPreview(true)} />;
  return children;
}

function AuthScreen({
  onPreview,
  setupOnly = false,
}: {
  onPreview: () => void;
  setupOnly?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [nametag, setNametag] = useState("");
  const [nametagState, setNametagState] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [resendRemaining, setResendRemaining] = useState(0);

  useEffect(() => {
    if (resendRemaining <= 0) return;
    const timer = window.setTimeout(
      () => setResendRemaining((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendRemaining]);

  useEffect(() => {
    const candidate = normalizeNametag(nametag);
    if (mode !== "register" || !candidate) {
      setNametagState("idle");
      return;
    }
    if (!nametagPattern.test(candidate)) {
      setNametagState("invalid");
      return;
    }
    setNametagState("checking");
    const timer = window.setTimeout(() => {
      void checkNametagAvailability(candidate)
        .then((available) => setNametagState(available ? "available" : "taken"))
        .catch(() => setNametagState("idle"));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [mode, nametag]);

  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const values = new FormData(event.currentTarget);
    try {
      const email = normalizeEmail(
        String(values.get("email") ?? registration?.email ?? ""),
      );
      if (mode === "reset") {
        await requestPasswordReset(email);
        setMessage(
          "Se houver uma conta para este e-mail, enviaremos as instruções de recuperação.",
        );
      } else if (mode === "register") {
        const displayName = String(values.get("displayName") ?? "").trim();
        const candidate = normalizeNametag(String(values.get("nametag") ?? ""));
        const password = String(values.get("password") ?? "");
        const confirmation = String(values.get("passwordConfirmation") ?? "");
        if (displayName.length < 2 || displayName.length > 32)
          throw new Error("O nome precisa ter entre 2 e 32 caracteres.");
        if (!nametagPattern.test(candidate))
          throw new Error("Use de 3 a 20 letras minúsculas, números ou _.");
        if (nametagState === "taken")
          throw new Error("Este nametag já está em uso.");
        if (nametagState === "checking")
          throw new Error("Aguarde a verificação do nametag.");
        const invalidPassword = passwordError(password);
        if (invalidPassword) throw new Error(invalidPassword);
        if (password !== confirmation)
          throw new Error("As senhas não coincidem.");
        await signUp(email, password, displayName, candidate);
        setRegistration({ email, displayName, nametag: candidate });
        setResendRemaining(60);
        setMode("verify");
        setMessage(registrationMessage);
      } else if (mode === "verify") {
        const code = String(values.get("code") ?? "").replace(/\D/g, "");
        if (!/^\d{6}$/.test(code))
          throw new Error(
            "Digite o código de seis dígitos enviado por e-mail.",
          );
        await verifySignupCode(registration?.email ?? email, code);
      } else {
        await signIn(email, String(values.get("password")));
      }
    } catch (reason) {
      const raw =
        reason instanceof Error ? reason.message : "Não foi possível concluir.";
      if (
        mode === "register" &&
        !raw.startsWith("O nome") &&
        !raw.startsWith("Use de") &&
        !raw.startsWith("Este nametag") &&
        !raw.startsWith("Aguarde") &&
        !raw.startsWith("A senha") &&
        !raw.startsWith("As senhas")
      ) {
        setError(
          raw.toLowerCase().includes("already registered")
            ? registrationMessage
            : "Não foi possível criar a conta agora. Verifique os dados e tente novamente.",
        );
      } else setError(raw);
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (!registration || resendRemaining > 0) return;
    setLoading(true);
    setError("");
    try {
      await resendSignupCode(registration.email);
      setResendRemaining(60);
      setMessage(registrationMessage);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível reenviar o código.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <img src={toxitySymbol} alt="Toxity" />
        <span className="eyebrow">CONVERSAS QUE ACONTECEM</span>
        <h1>Entre na mesma sintonia.</h1>
        <p>
          Chame seus amigos, compartilhe o que está vendo e transforme qualquer
          grupo em um lugar vivo.
        </p>
        <div className="story-orbits">
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <img src={toxitySymbol} alt="" />
            <strong>Toxity</strong>
          </div>
          <span className="eyebrow">
            {mode === "register"
              ? "SUA IDENTIDADE"
              : mode === "verify"
                ? "CONFIRME SEU E-MAIL"
                : mode === "reset"
                  ? "RECUPERAR ACESSO"
                  : "BEM-VINDO DE VOLTA"}
          </span>
          <h2>
            {setupOnly
              ? "Conecte o backend"
              : mode === "register"
                ? "Crie seu espaço"
                : mode === "verify"
                  ? "Digite seu código"
                  : mode === "reset"
                    ? "Recupere seu acesso"
                    : "Continue de onde parou"}
          </h2>
          {setupOnly ? (
            <>
              <p className="auth-description">
                Copie <code>.env.example</code> para <code>.env</code> e
                adicione as credenciais públicas do Supabase.
              </p>
              <button className="auth-submit" onClick={onPreview}>
                Abrir prévia local <ArrowRight size={18} />
              </button>
            </>
          ) : mode === "verify" ? (
            <form onSubmit={submit} className="auth-verify-form">
              <p className="auth-description">
                Enviamos um código de seis dígitos para{" "}
                <strong>{maskEmail(registration?.email ?? "")}</strong>. Você
                pode abri-lo no celular e digitar o código aqui.
              </p>
              <label className="auth-field">
                <span>Código de confirmação</span>
                <div>
                  <ShieldCheck />
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    autoFocus
                  />
                </div>
              </label>
              {error && <p className="auth-error">{error}</p>}
              {message && <p className="auth-success">{message}</p>}
              <button className="auth-submit" disabled={loading}>
                {loading ? "Verificando…" : "Confirmar e entrar"}
                <ArrowRight size={18} />
              </button>
              <button
                className="auth-secondary"
                type="button"
                disabled={loading || resendRemaining > 0}
                onClick={() => void resendCode()}
              >
                {resendRemaining > 0
                  ? `Reenviar em ${resendRemaining}s`
                  : "Reenviar código"}
              </button>
              <button
                className="auth-links-single"
                type="button"
                onClick={() => changeMode("login")}
              >
                Voltar para entrar
              </button>
            </form>
          ) : (
            <form onSubmit={submit}>
              {mode === "register" && (
                <div className="auth-row">
                  <Field
                    icon={<UserRound />}
                    name="displayName"
                    label="Nome"
                    placeholder="Como quer ser chamado?"
                    minLength={2}
                    maxLength={32}
                  />
                  <label className="auth-field">
                    <span>Nametag</span>
                    <div>
                      <AtSign />
                      <input
                        name="nametag"
                        value={nametag}
                        onChange={(event) =>
                          setNametag(normalizeNametag(event.target.value))
                        }
                        placeholder="seu_nametag"
                        maxLength={20}
                        autoComplete="off"
                      />
                      {nametagState === "available" && (
                        <Check className="auth-valid" />
                      )}
                    </div>
                    <NametagHint state={nametagState} />
                  </label>
                </div>
              )}
              <Field
                icon={<Mail />}
                name="email"
                label="E-mail"
                placeholder="voce@email.com"
                type="email"
                defaultValue={registration?.email}
              />
              {mode !== "reset" && (
                <>
                  <label className="auth-field">
                    <span>Senha</span>
                    <div>
                      <KeyRound />
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="10+ caracteres, letra e número"
                        minLength={10}
                        autoComplete={
                          mode === "register"
                            ? "new-password"
                            : "current-password"
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </button>
                    </div>
                  </label>
                  {mode === "register" && (
                    <label className="auth-field">
                      <span>Confirmar senha</span>
                      <div>
                        <KeyRound />
                        <input
                          name="passwordConfirmation"
                          type={showPassword ? "text" : "password"}
                          placeholder="Repita sua senha"
                          minLength={10}
                          autoComplete="new-password"
                        />
                      </div>
                    </label>
                  )}
                </>
              )}
              {error && <p className="auth-error">{error}</p>}
              {message && <p className="auth-success">{message}</p>}
              <button
                className="auth-submit"
                disabled={
                  loading ||
                  (mode === "register" && nametagState === "checking")
                }
              >
                {loading
                  ? "Aguarde…"
                  : mode === "register"
                    ? "Criar conta"
                    : mode === "reset"
                      ? "Enviar instruções"
                      : "Entrar"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {!setupOnly && mode !== "verify" && (
            <div className="auth-links">
              {mode === "login" && (
                <button onClick={() => changeMode("reset")}>
                  Esqueci minha senha
                </button>
              )}
              <button
                onClick={() =>
                  changeMode(mode === "register" ? "login" : "register")
                }
              >
                {mode === "register" ? "Já tenho uma conta" : "Criar uma conta"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

function NametagHint({
  state,
}: {
  state: "idle" | "checking" | "available" | "taken" | "invalid";
}) {
  if (state === "idle")
    return (
      <small className="auth-field-hint">
        3–20 caracteres: letras, números ou _
      </small>
    );
  if (state === "checking")
    return <small className="auth-field-hint">Verificando nametag…</small>;
  if (state === "available")
    return (
      <small className="auth-field-hint success">Nametag disponível.</small>
    );
  if (state === "taken")
    return (
      <small className="auth-field-hint error">
        Este nametag já está em uso.
      </small>
    );
  return (
    <small className="auth-field-hint error">
      Use somente letras minúsculas, números ou _.
    </small>
  );
}

function Field({
  icon,
  label,
  ...input
}: {
  icon: ReactNode;
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div>
        {icon}
        <input {...input} required />
      </div>
    </label>
  );
}
