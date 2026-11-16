import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Users,
  Ticket,
  LayoutDashboard,
  BookOpen,
  Wallet,
  Wifi,
  GraduationCap,
  ArrowLeft,
  LogOut,
  Plus,
  Pause,
  Play,
  CheckCircle2,
  Search,
  Download,
  Settings2,
  ExternalLink,
  RotateCcw,
  Info,
  X,
  Menu,
  ShieldCheck,
  Layers,
  Monitor,
  HelpCircle,
  LoaderCircle,
  Archive,
  Volume2,
  VolumeX,
  AlertCircle,
} from "lucide-react";
import { request, readSession, estimate, dateTime } from "./api.js";

const icons = { AC: GraduationCap, FA: Wallet, IT: Wifi, LB: BookOpen };
const theme = (prefix) =>
  ({ AC: "violet", FA: "peach", IT: "mint", LB: "blue" })[prefix] || "violet";
const cap = (s) =>
  ({
    waiting: "Waiting",
    called: "Your turn",
    serving: "In service",
    completed: "Completed",
    cancelled: "Cancelled",
    missed: "Missed",
    expired: "Expired",
    open: "Open",
    paused: "Paused",
    closed: "Closed to new visits",
  })[s] || s;
function Status({ value }) {
  return (
    <span className={`status ${value}`}>
      <i />
      {cap(value)}
    </span>
  );
}
function Spinner() {
  return <LoaderCircle className="spin" size={18} aria-label="Loading" />;
}
function Brand() {
  return (
    <span className="brand">
      <img src="/icon.svg" alt="" />
      <span>
        Queue<span>Flow</span>
      </span>
    </span>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null),
    titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    const focusables = () => [
      ...dialog.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
      ),
    ];
    focusables()[0]?.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const f = focusables();
        const first = f[0],
          last = f.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-top">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function App() {
  const [route, setRoute] = useState(location.pathname);
  const [demo, setDemo] = useState(() => readSession("qf-demo"));
  const [session, setSession] = useState(() => {
    const d = readSession("qf-demo");
    return d && location.pathname.startsWith("/staff")
      ? d.staff
      : readSession("qf-session") || d?.student || null;
  });
  useEffect(() => {
    if (session) sessionStorage.setItem("qf-session", JSON.stringify(session));
  }, [session]);
  const [data, setData] = useState(null),
    [loadError, setLoadError] = useState(""),
    [connected, setConnected] = useState(false);
  const [modal, setModal] = useState(null),
    [notice, setNotice] = useState(null),
    [busy, setBusy] = useState(false),
    [guide, setGuide] = useState(false),
    [menu, setMenu] = useState(false);
  const [tick, setTick] = useState(Date.now()),
    [sound, setSound] = useState(false);
  const loadSequence = useRef(0),
    keys = useRef(new Map()),
    audio = useRef(null),
    previousVisit = useRef(null);
  const staff = session?.user?.role === "staff";
  const navigate = useCallback((path) => {
    history.pushState({}, "", path);
    setRoute(path);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  useEffect(() => {
    const onPop = () => setRoute(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const saveSession = useCallback((s) => {
    setSession(s);
    if (s) sessionStorage.setItem("qf-session", JSON.stringify(s));
    else sessionStorage.removeItem("qf-session");
  }, []);
  const clearSession = useCallback(() => {
    saveSession(null);
    setDemo(null);
    sessionStorage.removeItem("qf-demo");
  }, [saveSession]);
  const refresh = useCallback(async () => {
    const seq = ++loadSequence.current;
    try {
      const d = await request(session ? "/api/workspace" : "/api/public", {
        token: session?.token,
      });
      if (seq === loadSequence.current) {
        setData({ ...d, clientReceivedAt: Date.now() });
        setLoadError("");
      }
      return d;
    } catch (e) {
      if (seq !== loadSequence.current) return;
      if ([401, 410].includes(e.status)) {
        clearSession();
        setNotice({ type: "error", text: e.message });
        navigate("/");
      } else setLoadError(e.message);
    }
  }, [session?.token, clearSession, navigate]);
  useEffect(() => {
    setData(null);
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => {
      clearInterval(interval);
      loadSequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (!session?.token) {
      setConnected(false);
      return;
    }
    const socket = io({
      auth: { token: session.token },
      reconnectionAttempts: Infinity,
    });
    socket.on("connect", () => {
      setConnected(true);
      refresh();
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("queue:changed", refresh);
    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [session?.token, refresh]);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const visit = data?.visit;
    if (
      visit?.status === "called" &&
      previousVisit.current !== `${visit.id}:called`
    ) {
      setNotice({
        type: "success",
        text: `It’s your turn! Take ${visit.token} to ${visit.location}.`,
      });
      if (sound && audio.current) {
        const ctx = audio.current;
        const oscillator = ctx.createOscillator(),
          gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.frequency.value = 660;
        gain.gain.value = 0.12;
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.3);
      }
    }
    previousVisit.current = visit ? `${visit.id}:${visit.status}` : null;
  }, [data?.visit?.id, data?.visit?.status, sound]);
  async function action(path, body = {}, message, method = "POST") {
    if (busy) return false;
    setBusy(true);
    const fingerprint = method + path + JSON.stringify(body);
    let key = keys.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(fingerprint, key);
    }
    try {
      const result = await request(path, {
        token: session?.token,
        method,
        body,
        key,
      });
      keys.current.delete(fingerprint);
      await refresh();
      if (message) setNotice({ type: "success", text: message });
      return result;
    } catch (e) {
      if (!e.network) keys.current.delete(fingerprint);
      setNotice({ type: "error", text: e.message });
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function startDemo() {
    if (busy) return;
    setBusy(true);
    try {
      const d = await request("/api/demo", { method: "POST", body: {} });
      sessionStorage.setItem("qf-demo", JSON.stringify(d));
      setDemo(d);
      saveSession(d.student);
      setModal(null);
      setGuide(true);
      navigate("/");
      setNotice({
        type: "success",
        text: "Your own practice workspace is ready. Start by choosing a service.",
      });
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  }
  function switchRole(role) {
    if (!demo) return;
    saveSession(demo[role]);
    navigate(role === "staff" ? "/staff" : "/");
    setModal(null);
  }
  async function signOut() {
    if (session)
      await request("/api/auth/logout", {
        token: session.token,
        method: "POST",
        body: {},
      }).catch(() => {});
    clearSession();
    navigate("/");
    setModal(null);
    setNotice({ type: "success", text: "You’ve left the workspace." });
  }
  const closeModal = useCallback(() => {
    if (!busy) setModal(null);
  }, [busy]);
  const selectedService =
    modal?.type === "service"
      ? data?.queues?.find((q) => q.id === modal.queue.id) || modal.queue
      : null;
  const now =
    tick + (data?.serverNow ? data.serverNow - data.clientReceivedAt : 0);
  const showAuth = (mode = "login", pending = null) => {
    if (data?.showcaseOnly) {
      startDemo();
      return;
    }
    setModal({ type: "auth", mode, pending });
  };
  function enableSound() {
    if (!sound) {
      try {
        audio.current ||= new (
          window.AudioContext || window.webkitAudioContext
        )();
        audio.current.resume();
        setSound(true);
      } catch {
        setNotice({
          type: "error",
          text: "Sound is unavailable in this browser. On-page updates will still appear.",
        });
      }
    } else setSound(false);
  }
  const [authTab, setAuthTab] = useState("login");
  useEffect(() => {
    if (modal?.type === "auth") setAuthTab(modal.mode);
  }, [modal?.type, modal?.mode]);
  const visitCount = Boolean(data?.visit);
  const nav = staff
    ? [
        ["/staff", "Service desk", LayoutDashboard],
        ["/staff/history", "Visit history", Clock3],
        ["/staff/services", "Manage services", Settings2],
        ["/display", "Counter display", Monitor],
      ]
    : [
        ["/", "Find a service", Layers],
        ["/visit", "My visit", Ticket],
        ["/history", "Visit history", Clock3],
        ["/display", "Counter display", Monitor],
      ];
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="brand-button"
            onClick={() => navigate(staff ? "/staff" : "/")}
            aria-label="QueueFlow home"
          >
            <Brand />
          </button>
          <div className="campus-label">
            <span className="separator" />
            Campus, at your pace.
          </div>
          <div className="topbar-actions">
            <span className={`connection ${connected ? "online" : ""}`}>
              <i />
              {connected ? "Live updates" : "Updates every 15s"}
            </span>
            <button
              className="text-button help-top"
              onClick={() => setGuide((v) => !v)}
            >
              <HelpCircle size={17} />
              How it works
            </button>
            {session ? (
              <button
                className="profile"
                onClick={() => setModal({ type: "account" })}
                aria-label="Open account"
              >
                <span>{session.user.name.slice(0, 1)}</span>
                <span>{session.user.name.split(" ")[0]}</span>
                <ChevronDown size={14} />
              </button>
            ) : (
              <button
                className="button small outline"
                onClick={() => showAuth("login")}
                disabled={busy}
              >
                {data?.showcaseOnly ? "Try demo" : "Sign in"}
                <ArrowUpRight size={15} />
              </button>
            )}
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
          </div>
        </div>
      </header>
      {data?.showcaseOnly && (
        <div className="showcase-bar">
          <Info size={16} />
          <p>
            <strong>Public showcase.</strong> Use fictional practice accounts.
            Sample visits can reset after inactivity or restarts.
          </p>
          {!demo && (
            <button className="text-button" disabled={busy} onClick={startDemo}>
              Start practice
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      )}
      {demo && (
        <div className="demo-bar">
          <div>
            <span className="demo-tag">
              <Layers size={13} />
              PRACTICE
            </span>
            <span>Fictional visitors. Your own workspace.</span>
            <span className="demo-detail">
              {" "}
              15-second arrival window for a quicker demo.
            </span>
          </div>
          <div className="demo-switch">
            <button
              className={!staff ? "selected" : ""}
              onClick={() => switchRole("student")}
              disabled={busy}
            >
              Student view
            </button>
            <button
              className={staff ? "selected" : ""}
              onClick={() => switchRole("staff")}
              disabled={busy}
            >
              Staff view
            </button>
            <button
              className="open-tab"
              onClick={() => {
                const tab = window.open("/staff?practice=1", "_blank");
                if (tab) tab.opener = null;
              }}
              title="Open this practice workspace in a second staff tab"
            >
              <ExternalLink size={14} />
              <span>Second tab</span>
            </button>
          </div>
        </div>
      )}
      <div className="app-shell">
        <aside className={`sidebar ${menu ? "expanded" : ""}`}>
          <div className="sidebar-kicker">
            {staff ? "WORKSPACE" : "STUDENT PORTAL"}
          </div>
          <nav aria-label="Main navigation">
            {nav.map(([path, label, Icon]) => (
              <button
                key={path}
                className={`nav-item ${route === path ? "active" : ""}`}
                onClick={() => navigate(path)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {path === "/visit" && visitCount && (
                  <span className="nav-count">1</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-lower">
            <div className="little-orbit">
              <span />
              <span />
              <span />
            </div>
            <strong>A calmer kind of campus.</strong>
            <p>
              Join from here.
              <br />
              Show up when it’s your turn.
            </p>
            <button className="text-button" onClick={() => setGuide(true)}>
              A quick walkthrough
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="sidebar-foot">
            <span className="tiny-dot" />
            {demo ? "Practice campus" : "Campus services"}
            <small>INDIA STANDARD TIME</small>
          </div>
        </aside>
        <main
          id="main"
          className={`main ${route === "/display" ? "display-main" : ""}`}
          tabIndex={-1}
        >
          {notice && (
            <div
              className={`notice ${notice.type}`}
              role={notice.type === "error" ? "alert" : "status"}
            >
              <span>
                {notice.type === "error" ? (
                  <AlertCircle size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )}
              </span>
              <p>{notice.text}</p>
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice(null)}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {loadError && (
            <div className="notice error" role="alert">
              <AlertCircle size={18} />
              <p>{loadError}</p>
              <button className="text-button" onClick={refresh}>
                Retry
              </button>
            </div>
          )}
          {guide && (
            <Guide
              staff={staff}
              demo={Boolean(demo)}
              close={() => setGuide(false)}
              startDemo={startDemo}
              busy={busy}
            />
          )}
          {!data && !loadError ? (
            <div className="loading-state">
              <Spinner />
              <p>Getting the campus ready…</p>
            </div>
          ) : (
            data && (
              <>
                {route === "/display" ? (
                  <Display data={data} now={now} demo={demo} />
                ) : staff ? (
                  route === "/staff/history" ? (
                    <History
                      data={data}
                      session={session}
                      staff
                      action={action}
                      busy={busy}
                    />
                  ) : route === "/staff/services" ? (
                    <Services
                      data={data}
                      busy={busy}
                      action={action}
                      setModal={setModal}
                    />
                  ) : (
                    <Desk
                      data={data}
                      session={session}
                      action={action}
                      busy={busy}
                      now={now}
                      navigate={navigate}
                    />
                  )
                ) : route.startsWith("/staff") ? (
                  <StaffEntry
                    signIn={() => showAuth("login")}
                    startDemo={startDemo}
                    busy={busy}
                  />
                ) : route === "/visit" ? (
                  <Visit
                    data={data}
                    busy={busy}
                    navigate={navigate}
                    setModal={setModal}
                    sound={sound}
                    enableSound={enableSound}
                  />
                ) : route === "/history" ? (
                  <History
                    data={data}
                    session={session}
                    action={action}
                    busy={busy}
                  />
                ) : route === "/" ? (
                  <Home
                    data={data}
                    session={session}
                    busy={busy}
                    startDemo={startDemo}
                    setModal={setModal}
                    navigate={navigate}
                    showGuide={() => setGuide(true)}
                  />
                ) : (
                  <div className="empty-state">
                    <h1>This page took a different turn.</h1>
                    <p>Let’s get back to the service directory.</p>
                    <button
                      className="button primary"
                      onClick={() => navigate("/")}
                    >
                      Go home
                      <ArrowRight size={18} />
                    </button>
                  </div>
                )}
                <footer className="page-footer">
                  <span>Made for the time between things.</span>
                  <span>
                    QueueFlow <span>✳</span>
                  </span>
                </footer>
              </>
            )
          )}
        </main>
      </div>
      {modal?.type === "service" && (
        <Modal title="Plan your visit" onClose={closeModal}>
          <ServiceDetails
            queue={selectedService}
            visit={data?.visit}
            busy={busy}
            showcase={Boolean(data?.showcaseOnly && !session)}
            close={closeModal}
            join={async (purpose) => {
              if (!session) {
                showAuth("register", selectedService);
                return;
              }
              const result = await action(
                `/api/queues/${selectedService.id}/tickets`,
                { purpose },
                "You’re in. Your token and position are ready.",
              );
              if (result) {
                setModal(null);
                navigate("/visit");
              }
            }}
            openVisit={() => {
              setModal(null);
              navigate("/visit");
            }}
          />
        </Modal>
      )}
      {modal?.type === "auth" && (
        <Modal
          title={
            authTab === "register"
              ? "A place in line. A moment to sign up."
              : "Welcome back."
          }
          onClose={closeModal}
        >
          <AuthForm
            mode={authTab}
            setMode={setAuthTab}
            busy={busy}
            setBusy={setBusy}
            startDemo={startDemo}
            onSuccess={(s) => {
              saveSession(s);
              if (modal.pending && s.user.role === "student")
                setModal({ type: "service", queue: modal.pending });
              else {
                setModal(null);
                navigate(s.user.role === "staff" ? "/staff" : "/");
              }
              setNotice({
                type: "success",
                text: `You’re signed in, ${s.user.name.split(" ")[0]}.`,
              });
            }}
          />
        </Modal>
      )}
      {modal?.type === "cancel" && (
        <Modal title="Leave this queue?" onClose={closeModal}>
          <p className="modal-copy">
            Your token <strong>{modal.visit.token}</strong> will be cancelled.
            If you join again, you’ll get a new token at the end of the queue.
          </p>
          <div className="modal-actions">
            <button
              className="button outline"
              disabled={busy}
              onClick={closeModal}
            >
              Keep my place
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await action(
                    `/api/tickets/${modal.visit.id}/cancel`,
                    {},
                    "Visit cancelled. You can join another service whenever you’re ready.",
                  )
                )
                  setModal(null);
              }}
            >
              {busy ? <Spinner /> : null}Leave queue
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === "account" && (
        <Modal title="Your workspace" onClose={closeModal}>
          <div className="account-detail">
            <div className="avatar large">{session.user.name[0]}</div>
            <h3>{session.user.name}</h3>
            <p>{session.user.email}</p>
            <Status value={staff ? "Staff account" : "Student account"} />
          </div>
          {demo && (
            <p className="helper">
              This is a fictional practice account. Your demo expires after 24
              hours. Resetting clears visits in this practice workspace only.
            </p>
          )}
          <div className="account-buttons">
            {demo && (
              <button
                className="button outline"
                onClick={() => {
                  setModal({ type: "reset" });
                }}
              >
                <RotateCcw size={16} />
                Reset practice visits
              </button>
            )}
            <button className="button outline" onClick={signOut}>
              <LogOut size={16} />
              {demo ? "Leave practice workspace" : "Sign out"}
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === "reset" && (
        <Modal title="Start the practice again?" onClose={closeModal}>
          <p className="modal-copy">
            This clears visits and restores the fictional queue in this practice
            workspace. Service details stay as you edited them. Other workspaces
            are unaffected.
          </p>
          <div className="modal-actions">
            <button
              className="button outline"
              disabled={busy}
              onClick={closeModal}
            >
              Keep exploring
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await request("/api/demo/reset", {
                    token: demo.staff.token,
                    method: "POST",
                    body: {},
                  });
                  await refresh();
                  setModal(null);
                  setNotice({
                    type: "success",
                    text: "Practice visits reset. You can try the full journey again.",
                  });
                } catch (e) {
                  setNotice({ type: "error", text: e.message });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Spinner /> : <RotateCcw size={16} />}Reset practice
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === "edit-service" && (
        <Modal
          title={modal.queue ? "Edit service" : "Make room for a new service"}
          onClose={closeModal}
          wide
        >
          <ServiceForm
            queue={modal.queue}
            busy={busy}
            save={async (value) => {
              const q = modal.queue;
              const result = await action(
                q ? `/api/staff/queues/${q.id}` : "/api/staff/queues",
                { ...value, ...(q ? { version: q.version } : {}) },
                q ? "Service details updated." : "New service created.",
                q ? "PATCH" : "POST",
              );
              if (result) setModal(null);
            }}
            close={closeModal}
          />
        </Modal>
      )}
      {modal?.type === "archive" && (
        <Modal title="Archive this service?" onClose={closeModal}>
          <p className="modal-copy">
            {modal.queue.name} will leave the service directory. Its visit
            history will remain in your records. It must be closed with no
            active visitors.
          </p>
          <div className="modal-actions">
            <button
              className="button outline"
              disabled={busy}
              onClick={closeModal}
            >
              Keep service
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await action(
                    `/api/staff/queues/${modal.queue.id}`,
                    { version: modal.queue.version },
                    "Service archived. Visit history has been kept.",
                    "DELETE",
                  )
                )
                  setModal(null);
              }}
            >
              {busy ? <Spinner /> : <Archive size={16} />}Archive service
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Guide({ staff, demo, close, startDemo, busy }) {
  const items = staff
    ? [
        [
          "01",
          "Call the next token",
          "The earliest waiting visitor is called. Only one visit can occupy this counter.",
        ],
        [
          "02",
          "Start when they arrive",
          "Confirm their arrival. After the arrival window, an absent visitor can be marked missed.",
        ],
        [
          "03",
          "Complete, then continue",
          "Finish the visit and explicitly call the next token. Nothing advances silently.",
        ],
      ]
    : [
        [
          "01",
          "Choose your service",
          "Check the location, queue status and documents to bring.",
        ],
        [
          "02",
          "Get your token",
          "Join one queue. Your place is saved even if you refresh.",
        ],
        [
          "03",
          "Follow your turn",
          "Keep this page open. When called, go to the counter; cancel if plans change.",
        ],
      ];
  return (
    <section className="guide">
      <div className="section-heading">
        <div>
          <span className="eyebrow">A LITTLE ORIENTATION</span>
          <h2>
            {staff
              ? "A desk that makes sense."
              : "Three steps. Then get on with your day."}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close walkthrough"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <div className="guide-steps">
        {items.map(([n, title, body]) => (
          <div key={n}>
            <span>{n}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>
      {!demo && (
        <button className="text-button" disabled={busy} onClick={startDemo}>
          Try it with fictional visitors
          <ArrowRight size={16} />
        </button>
      )}
      {demo && (
        <p className="guide-bottom">
          <Info size={15} />
          Use Student view and Staff view above to experience both sides. A
          second tab lets you see updates arrive live.
        </p>
      )}
    </section>
  );
}
function Home({
  data,
  session,
  busy,
  startDemo,
  setModal,
  navigate,
  showGuide,
}) {
  const [search, setSearch] = useState(""),
    [onlyOpen, setOnlyOpen] = useState(false);
  const queues = data.queues.filter(
    (q) =>
      (!onlyOpen || q.status === "open") &&
      (q.name + " " + q.description)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const open = data.queues.filter((q) => q.status === "open").length;
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="mini-sun">✳</span>A LITTLE LESS WAITING
          </div>
          <h1>
            Your time,
            <br />
            back in your <em>hands.</em>
          </h1>
          <p>
            Get in line without standing in one.
            <br />
            Find your campus service. We’ll keep your place.
          </p>
          <div className="hero-actions">
            <button
              className="button primary"
              onClick={() =>
                document
                  .getElementById("services")
                  .scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Find a service
              <ArrowRight size={18} />
            </button>
            <button className="text-button" onClick={showGuide}>
              How it works
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="hero-footnote">
            <ShieldCheck size={15} />
            {session
              ? "Your visit is saved to your account."
              : "One token. A clear next step. No standing around."}
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="floating-leaf leaf-one" />
          <div className="floating-leaf leaf-two" />
          <div className="art-chip">
            <span />A little room to breathe
          </div>
          <div className="visual-ticket">
            <div className="vt-top">
              <span>YOUR NEXT CHAPTER</span>
              <img src="/icon.svg" alt="" />
            </div>
            <div className="vt-token">
              Less wait.
              <br />
              <span>More day.</span>
            </div>
            <div className="vt-perforation" />
            <div className="vt-footer">
              <span>
                <CheckCircle2 size={16} />
                We’ve got your place.
              </span>
              <ArrowUpRight size={21} />
            </div>
          </div>
          <div className="art-pill">
            <span className="tiny-dot" />
            Go at your own pace.
          </div>
          <span className="art-star">✳</span>
        </div>
      </section>
      {data.visit && (
        <button className="visit-strip" onClick={() => navigate("/visit")}>
          <div className="visit-strip-icon">
            <Ticket size={23} />
          </div>
          <div>
            <span>YOUR ACTIVE VISIT</span>
            <strong>
              {data.visit.token}
              <small>{data.visit.queueName}</small>
            </strong>
          </div>
          <Status value={data.visit.status} />
          <span className="visit-strip-end">
            Open my visit
            <ArrowRight size={18} />
          </span>
        </button>
      )}
      {!session && data.allowDemo !== false && (
        <section className="demo-invite">
          <span className="demo-icon">
            <Play size={19} />
          </span>
          <div>
            <strong>Just looking around? Take it for a spin.</strong>
            <p>
              A ready-made campus, fictional visitors and both sides of the
              counter.
            </p>
          </div>
          <button
            className="button small outline"
            disabled={busy}
            onClick={startDemo}
          >
            {busy ? <Spinner /> : null}Try the live demo
            <ArrowUpRight size={16} />
          </button>
        </section>
      )}
      <section id="services" className="service-directory">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CAMPUS SERVICES</span>
            <h2>Where are you headed?</h2>
            <p>
              {open} {open === 1 ? "service is" : "services are"} accepting
              visitors. Choose one to see the details.
            </p>
          </div>
          <div className="directory-tools">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Find a service"
                placeholder="Find a service…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className={`filter-button ${onlyOpen ? "selected" : ""}`}
              onClick={() => setOnlyOpen(!onlyOpen)}
              aria-pressed={onlyOpen}
            >
              Open now{onlyOpen && <Check size={14} />}
            </button>
          </div>
        </div>
        <div className="service-grid">
          {queues.map((q) => (
            <ServiceCard
              key={q.id}
              q={q}
              open={() => setModal({ type: "service", queue: q })}
            />
          ))}
        </div>
        {!queues.length && (
          <div className="empty-state compact">
            <Search size={26} />
            <h3>No services found.</h3>
            <p>Try a different name or turn off the Open now filter.</p>
            <button
              className="text-button"
              onClick={() => {
                setSearch("");
                setOnlyOpen(false);
              }}
            >
              Clear filters
              <RotateCcw size={15} />
            </button>
          </div>
        )}
        <p className="directory-note">
          <Info size={15} />
          Wait ranges are estimates, not appointments. They change as visits are
          completed.
        </p>
      </section>
    </>
  );
}
function ServiceCard({ q, open }) {
  const Icon = icons[q.prefix] || Layers;
  return (
    <article className={`service-card ${theme(q.prefix)}`}>
      <div className="service-card-top">
        <div className="service-icon">
          <Icon size={25} />
        </div>
        <Status value={q.full && q.status === "open" ? "Full" : q.status} />
      </div>
      <h3>{q.name}</h3>
      <p className="service-description">{q.description}</p>
      <div className="location">
        <MapPin size={14} />
        {q.location}
      </div>
      <div className="queue-metrics">
        <div>
          <Clock3 size={16} />
          <strong>
            {q.status === "closed" ? "Not accepting" : estimate(q.estimate)}
          </strong>
          <span>estimated wait</span>
        </div>
        <div>
          <Users size={16} />
          <strong>{q.waiting}</strong>
          <span>waiting</span>
        </div>
      </div>
      <button className="service-link" onClick={open}>
        View service
        <ArrowUpRight size={19} />
      </button>
    </article>
  );
}
function ServiceDetails({
  queue: q,
  visit,
  busy,
  join,
  openVisit,
  showcase = false,
}) {
  const [purpose, setPurpose] = useState("");
  const Icon = icons[q.prefix] || Layers;
  return (
    <>
      <div className={`detail-title ${theme(q.prefix)}`}>
        <span className="service-icon">
          <Icon size={28} />
        </span>
        <div>
          <h3>{q.name}</h3>
          <Status value={q.status} />
        </div>
      </div>
      <p className="modal-copy">{q.description}</p>
      <div className="detail-info">
        <div>
          <MapPin size={18} />
          <span>
            <small>WHERE TO GO</small>
            <strong>{q.location}</strong>
          </span>
        </div>
        <div>
          <Clock3 size={18} />
          <span>
            <small>ESTIMATED WAIT</small>
            <strong>
              {q.status === "closed"
                ? "Closed to new visits"
                : estimate(q.estimate)}
            </strong>
          </span>
        </div>
        <div>
          <Users size={18} />
          <span>
            <small>IN THE QUEUE</small>
            <strong>
              {q.waiting} waiting
              {q.current ? " · one visitor at the counter" : ""}
            </strong>
          </span>
        </div>
      </div>
      <h4 className="small-title">A couple of things to bring</h4>
      <ul className="requirements">
        {q.requirements.length ? (
          q.requirements.map((r) => (
            <li key={r}>
              <Check size={15} />
              {r}
            </li>
          ))
        ) : (
          <li>
            <Info size={15} />
            Check with the counter if you need particular documents.
          </li>
        )}
      </ul>
      {visit ? (
        <>
          <p className="helper">
            You already have token {visit.token} at {visit.queueName}. Finish or
            cancel that visit before joining another.
          </p>
          <button className="button primary full" onClick={openVisit}>
            Open my visit
            <ArrowRight size={17} />
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            join(purpose.trim());
          }}
        >
          <Field
            label="What can we help with?"
            hint="Optional. A short reason helps the counter staff prepare."
          >
            <input
              value={purpose}
              maxLength={120}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. A bonafide certificate"
            />
          </Field>
          <p className="helper">
            <Info size={15} />
            {q.status === "paused"
              ? "This service is paused. New tokens will be available after staff resume it."
              : q.status === "closed"
                ? "This service is closed to new visits. Existing visitors can still be served."
                : q.full
                  ? "This queue has reached its capacity. Please check back soon."
                  : "Your token is for today. Keep the visit page open for your turn. No SMS is sent."}
          </p>
          <button
            className="button primary full"
            disabled={busy || q.status !== "open" || q.full}
          >
            {busy ? <Spinner /> : <Ticket size={17} />}
            {showcase ? "Try with a practice account" : "Get my token"}
            <ArrowRight size={17} />
          </button>
        </form>
      )}
    </>
  );
}
function AuthForm({ mode, setMode, busy, setBusy, onSuccess, startDemo }) {
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      onSuccess(
        await request(`/api/auth/${mode}`, { method: "POST", body: values }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="auth-tabs">
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          Sign in
        </button>
        <button
          className={mode === "register" ? "active" : ""}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          Create student account
        </button>
      </div>
      <p className="modal-copy">
        {mode === "register"
          ? "Save your place and find your visit again whenever you return."
          : "Sign in to your student or staff account to continue."}
      </p>
      <form onSubmit={submit} key={mode}>
        {mode === "register" && (
          <Field label="Your name">
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={60}
              required
              placeholder="Full name"
            />
          </Field>
        )}
        <Field label="Email address">
          <input
            type="email"
            name="email"
            autoComplete="email"
            maxLength={160}
            required
            placeholder="you@college.edu"
          />
        </Field>
        <Field
          label="Password"
          hint={mode === "register" ? "Use at least 10 characters." : ""}
        >
          <input
            type="password"
            name="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            minLength={10}
            maxLength={128}
            required
          />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? <Spinner /> : null}
          {mode === "register" ? "Create my account" : "Sign in"}
          <ArrowRight size={17} />
        </button>
      </form>
      <div className="auth-demo">
        <span>Here for a demonstration?</span>
        <button className="text-button" disabled={busy} onClick={startDemo}>
          Try the practice workspace
          <ArrowUpRight size={15} />
        </button>
      </div>
    </>
  );
}

function Visit({ data, busy, navigate, setModal, sound, enableSound }) {
  const v = data.visit;
  if (!v)
    return (
      <>
        <PageTitle
          eyebrow="YOUR VISIT"
          title="A little room in your day."
          copy="When you join a service, your token and next step will appear here."
        />
        <div className="empty-state ticket-empty">
          <div className="empty-ticket">
            <Ticket size={48} />
          </div>
          <h2>No active visit, no waiting around.</h2>
          <p>
            Choose a service to get your token. Completed, cancelled and missed
            visits stay in your history.
          </p>
          <button className="button primary" onClick={() => navigate("/")}>
            Find a service
            <ArrowRight size={17} />
          </button>
        </div>
      </>
    );
  const called = v.status === "called",
    serving = v.status === "serving";
  return (
    <>
      <PageTitle
        eyebrow="YOUR VISIT"
        title={
          called
            ? "That’s your cue."
            : serving
              ? "You’re in good hands."
              : "Your place is taken care of."
        }
        copy={
          called
            ? "Please make your way to the counter now."
            : serving
              ? "The counter staff are helping you. Your visit ends when they mark it complete."
              : "You don’t need to stand by the counter. Keep this page open and follow your turn."
        }
      />
      <div className="visit-layout">
        <section
          className={`live-ticket ${called ? "called-ticket" : ""}`}
          aria-live="polite"
        >
          <div className="ticket-heading">
            <span>
              <Ticket size={18} />
              TODAY’S TOKEN
            </span>
            <Status value={v.status} />
          </div>
          <h2>{v.token}</h2>
          <div className="ticket-service">{v.queueName}</div>
          <div className="ticket-location">
            <MapPin size={16} />
            {v.location}
          </div>
          <div className="ticket-divider" />
          <div className="ticket-stats">
            <div>
              <span>People ahead</span>
              <strong>{v.ahead}</strong>
            </div>
            <div>
              <span>
                {v.status === "waiting" ? "Your position" : "Next step"}
              </span>
              <strong className={v.status === "waiting" ? "" : "word"}>
                {v.status === "waiting"
                  ? `#${v.position}`
                  : called
                    ? "Go to counter"
                    : "In service"}
              </strong>
            </div>
            <div>
              <span>Estimated wait</span>
              <strong className="word">
                {v.status === "waiting"
                  ? estimate(v.estimate)
                  : "It’s your turn"}
              </strong>
            </div>
          </div>
          {v.queueStatus === "paused" && v.status === "waiting" && (
            <div className="paused-note">
              <Pause size={16} />
              This service is paused. Your place is saved; the estimate will
              return when it resumes.
            </div>
          )}
          <p className="ticket-small">
            {v.serviceDay} · India Standard Time · Joined{" "}
            {dateTime(v.createdAt).split(",").at(-1)}
          </p>
        </section>
        <aside className="visit-help">
          <h3>Here’s what happens next.</h3>
          <ol className="visit-timeline">
            {[
              ["Joined the queue", "Your token is saved.", true],
              [
                "Called to the counter",
                `Bring your token to ${v.location}.`,
                called || serving,
              ],
              [
                "Visit in progress",
                "Staff confirm your arrival and help you.",
                serving,
              ],
              ["All done", "Your visit moves into history.", false],
            ].map(([title, copy, done], i) => (
              <li key={title} className={done ? "done" : ""}>
                <span>{done ? <Check size={13} /> : i + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              </li>
            ))}
          </ol>
          <button
            className="sound-switch"
            onClick={enableSound}
            aria-pressed={sound}
          >
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}On-page sound
            <span>{sound ? "On" : "Off"}</span>
          </button>
          <p className="helper">
            Sound works while this page is open. If you miss your turn, rejoin
            at the end with a new token.
          </p>
        </aside>
      </div>
      <section className="change-plans">
        <div>
          <strong>Plans changed?</strong>
          <p>
            {serving
              ? "Your visit has started. Speak to the counter staff if you need to leave."
              : "Leave the queue so the next person can move forward."}
          </p>
        </div>
        {!serving && (
          <button
            className="button outline"
            disabled={busy}
            onClick={() => setModal({ type: "cancel", visit: v })}
          >
            Leave queue
            <X size={16} />
          </button>
        )}
      </section>
    </>
  );
}
function PageTitle({ eyebrow, title, copy, children }) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {copy && <p>{copy}</p>}
      </div>
      {children}
    </div>
  );
}

function Desk({ data, session, action, busy, now, navigate }) {
  const [selected, setSelected] = useState(""),
    [desk, setDesk] = useState(null),
    [error, setError] = useState("");
  const sequence = useRef(0);
  useEffect(() => {
    if (!data.queues.some((q) => q.id === selected))
      setSelected(data.queues[0]?.id || "");
  }, [data.queues, selected]);
  const revision = data.queues.find((q) => q.id === selected)?.version;
  useEffect(() => {
    if (!selected) return;
    const n = ++sequence.current;
    setError("");
    request(`/api/staff/queues/${selected}`, { token: session.token })
      .then((d) => {
        if (n === sequence.current) setDesk(d);
      })
      .catch((e) => {
        if (n === sequence.current) setError(e.message);
      });
    return () => {
      sequence.current++;
    };
  }, [selected, revision, session.token]);
  const d = desk?.queue.id === selected ? desk : null,
    q = d?.queue,
    c = d?.current;
  const remaining = c?.calledAt
    ? Math.max(0, Math.ceil((c.calledAt + c.graceSeconds * 1000 - now) / 1000))
    : 0;
  const act = (a, message) =>
    action(
      `/api/staff/queues/${selected}/actions`,
      { action: a, version: q.version },
      message,
    );
  return (
    <>
      <PageTitle
        eyebrow="STAFF WORKSPACE"
        title="A good day starts with a little flow."
        copy="One visitor at a time. A clear next step for everyone."
      >
        <div className="desk-selector">
          <label htmlFor="desk-service">YOUR SERVICE</label>
          <div>
            <select
              id="desk-service"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
      </PageTitle>
      <div className="overview-stats">
        <Stat
          icon={Users}
          title="Waiting now"
          value={q?.waiting ?? "—"}
          copy="In this service queue"
        />
        <Stat
          icon={CheckCheck}
          title="Completed today"
          value={q?.completed ?? "—"}
          copy="Visits, not people currently waiting"
        />
        <Stat
          icon={Clock3}
          title="Typical visit"
          value={q ? `${q.averageMinutes} min` : "—"}
          copy="Configured service average"
        />
        <Stat
          icon={Layers}
          title="Service status"
          value={q ? cap(q.status) : "—"}
          copy={
            q?.status === "paused"
              ? "New joins and calls are paused"
              : "One counter for this service"
          }
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!selected ? (
        <div className="empty-state">
          <h2>Make room for your first service.</h2>
          <p>Create a service before calling visitors.</p>
          <button
            className="button primary"
            onClick={() => navigate("/staff/services")}
          >
            Manage services
            <ArrowRight size={17} />
          </button>
        </div>
      ) : !d ? (
        <div className="loading-state">
          <Spinner />
          <p>Opening your desk…</p>
        </div>
      ) : (
        <>
          <div className="desk-grid">
            <section
              className={`current-visitor ${c?.status === "called" ? "visitor-called" : ""}`}
            >
              <div className="section-heading">
                <span className="eyebrow">AT YOUR COUNTER</span>
                {c ? (
                  <Status value={c.status} />
                ) : (
                  <span className="muted">Ready when you are</span>
                )}
              </div>
              {c ? (
                <>
                  <div className="current-token">{c.token}</div>
                  <h2>{c.visitor}</h2>
                  <p className="current-purpose">
                    {c.purpose || "General service enquiry"}
                  </p>
                  <div className="current-location">
                    <MapPin size={15} />
                    {q.location}
                  </div>
                  <div className="current-actions">
                    {c.status === "called" ? (
                      <>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            act("start", `${c.token} is now in service.`)
                          }
                        >
                          {busy ? <Spinner /> : <Check size={17} />}Start visit
                        </button>
                        <button
                          className="button outline"
                          disabled={busy || remaining > 0}
                          onClick={() =>
                            act(
                              "miss",
                              `${c.token} was marked missed. They can rejoin at the end.`,
                            )
                          }
                        >
                          {remaining > 0
                            ? `Missed? Wait ${remaining}s`
                            : "Mark as missed"}
                        </button>
                      </>
                    ) : (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          act(
                            "complete",
                            `${c.token} completed. Call the next visitor when you’re ready.`,
                          )
                        }
                      >
                        {busy ? <Spinner /> : <CheckCheck size={18} />}Complete
                        visit
                        <ArrowRight size={17} />
                      </button>
                    )}
                  </div>
                  <p className="helper">
                    {c.status === "called"
                      ? `Give the visitor ${q.graceSeconds} seconds to arrive, then start their visit or mark them missed.`
                      : "Completing this visit will free the counter. The next token is called only when you choose."}
                  </p>
                </>
              ) : (
                <>
                  <div className="counter-empty-icon">
                    <Ticket size={38} />
                  </div>
                  <h2>
                    {q.waiting
                      ? "A new conversation awaits."
                      : "A moment to catch your breath."}
                  </h2>
                  <p className="current-purpose">
                    {q.waiting
                      ? "The first person in the waiting list is ready to be called."
                      : "There’s nobody waiting at this service right now."}
                  </p>
                  <button
                    className="button primary"
                    disabled={busy || !q.waiting || q.status === "paused"}
                    onClick={() =>
                      act(
                        "call",
                        "The next visitor has been called. Wait for them to arrive.",
                      )
                    }
                  >
                    <Play size={17} />
                    Call next visitor
                    <ArrowRight size={17} />
                  </button>
                  {q.status === "paused" && (
                    <p className="helper">
                      Resume this service in Manage services before calling
                      another visitor.
                    </p>
                  )}
                </>
              )}
            </section>
            <aside className="next-card">
              <span className="eyebrow">COMING UP NEXT</span>
              {d.waiting[0] ? (
                <>
                  <div className="next-token">{d.waiting[0].token}</div>
                  <h3>{d.waiting[0].visitor}</h3>
                  <p>{d.waiting[0].purpose || "General service enquiry"}</p>
                  <span className="next-position">
                    <Users size={16} />
                    First in the waiting list
                  </span>
                </>
              ) : (
                <>
                  <Ticket size={40} className="next-empty" />
                  <h3>The waiting list is clear.</h3>
                  <p>New visitors will appear here when they join.</p>
                </>
              )}
              <div className="fairness">
                <ShieldCheck size={21} />
                <p>
                  <strong>A fair turn for everyone.</strong>Visitors are called
                  in the order they join. Missed visitors rejoin at the end.
                </p>
              </div>
            </aside>
          </div>
          <section className="panel waiting-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">THE WAITING LIST</span>
                <h2>
                  Everyone in the flow{" "}
                  <span className="count-pill">{d.waiting.length}</span>
                </h2>
              </div>
              <span className="muted">Ordered by token sequence</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Token</th>
                    <th>Visitor</th>
                    <th>Visit reason</th>
                    <th>Joined</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.waiting.map((t, i) => (
                    <tr key={t.id}>
                      <td>
                        <span className="order-number">{i + 1}</span>
                      </td>
                      <td className="token-cell">{t.token}</td>
                      <td>{t.visitor}</td>
                      <td>{t.purpose || "General enquiry"}</td>
                      <td>{dateTime(t.createdAt)}</td>
                      <td>
                        {i === 0 ? (
                          <span className="up-next">Up next</span>
                        ) : (
                          <Status value="waiting" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!d.waiting.length && (
              <p className="table-empty">
                No one is waiting. New tokens appear here automatically.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
function Stat({ icon: Icon, title, value, copy }) {
  return (
    <div className="stat">
      <div className="stat-label">
        <span>{title}</span>
        <Icon size={17} />
      </div>
      <strong>{value}</strong>
      <small>{copy}</small>
    </div>
  );
}

function History({ data, session, staff = false }) {
  const [status, setStatus] = useState(""),
    [queueId, setQueueId] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [exporting, setExporting] = useState(false);
  const sequence = useRef(0);
  const revision = data.queues.map((q) => `${q.id}:${q.version}`).join("|");
  useEffect(() => {
    if (!session) return;
    const n = ++sequence.current;
    const timer = setTimeout(
      () => {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(page),
          status,
          queueId,
          search,
        });
        request(`/api/history?${params}`, { token: session.token })
          .then((r) => {
            if (n === sequence.current) {
              setResult(r);
              setError("");
            }
          })
          .catch((e) => {
            if (n === sequence.current) setError(e.message);
          })
          .finally(() => {
            if (n === sequence.current) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      sequence.current++;
    };
  }, [session?.token, status, queueId, search, page, revision]);
  async function download() {
    setExporting(true);
    try {
      const blob = await request("/api/staff/export", {
        token: session.token,
        blob: true,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "queueflow-visits.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow={staff ? "WORKSPACE RECORDS" : "YOUR RECORDS"}
        title="Every visit has a story."
        copy={
          staff
            ? "Find past visits and keep a clear record of what happened."
            : "Your current and past visits, all in one place."
        }
      >
        {staff && (
          <button
            className="button outline"
            disabled={exporting}
            onClick={download}
          >
            {exporting ? <Spinner /> : <Download size={17} />}Export all visits
          </button>
        )}
      </PageTitle>
      {!session ? (
        <div className="empty-state">
          <Ticket size={36} />
          <h2>Your visits will be here.</h2>
          <p>
            Sign in from the top bar, or try the practice workspace, to see your
            visit history.
          </p>
        </div>
      ) : (
        <section className="panel history-panel">
          <div className="history-filters">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Search visit history"
                placeholder={
                  staff ? "Search token or visitor…" : "Search token…"
                }
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="select-field">
              <span className="sr-only">Filter by service</span>
              <select
                value={queueId}
                onChange={(e) => {
                  setQueueId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All services</option>
                {data.queues.map((q) => (
                  <option value={q.id} key={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span className="sr-only">Filter by status</span>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {[
                  "waiting",
                  "called",
                  "serving",
                  "completed",
                  "cancelled",
                  "missed",
                  "expired",
                ].map((s) => (
                  <option key={s} value={s}>
                    {cap(s)}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">
              {loading ? <Spinner /> : `${result?.total ?? 0} visits`}
            </span>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Service</th>
                  {staff && <th>Visitor</th>}
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Finished</th>
                </tr>
              </thead>
              <tbody>
                {result?.items.map((t) => (
                  <tr key={t.id}>
                    <td className="token-cell">{t.token}</td>
                    <td>{t.queueName}</td>
                    {staff && <td>{t.visitor}</td>}
                    <td>{dateTime(t.createdAt)}</td>
                    <td>
                      <Status value={t.status} />
                    </td>
                    <td>{dateTime(t.endedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !result?.items.length && (
            <div className="empty-state compact">
              <Clock3 size={30} />
              <h3>
                {search || status || queueId
                  ? "No visits match those filters."
                  : "A fresh start."}
              </h3>
              <p>
                {search || status || queueId
                  ? "Try a different token, service or status."
                  : "Your visits will appear here as soon as you join a queue."}
              </p>
              {(search || status || queueId) && (
                <button
                  className="text-button"
                  onClick={() => {
                    setSearch("");
                    setStatus("");
                    setQueueId("");
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
          <div className="pagination">
            <span>
              Page {result?.total ? page : 0} of {result?.pages || 0} · 25
              visits per page
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous history page"
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Next history page"
                disabled={page >= (result?.pages || 0) || loading}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Services({ data, busy, action, setModal }) {
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE SETTINGS"
        title="A place for every kind of visit."
        copy="Keep service details and availability clear for everyone."
      >
        <button
          className="button primary"
          disabled={busy}
          onClick={() => setModal({ type: "edit-service" })}
        >
          <Plus size={18} />
          Add service
        </button>
      </PageTitle>
      <div className="service-grid management-grid">
        {data.queues.map((q) => {
          const Icon = icons[q.prefix] || Layers;
          return (
            <article
              key={q.id}
              className={`service-card manage-card ${theme(q.prefix)}`}
            >
              <div className="service-card-top">
                <span className="service-icon">
                  <Icon size={24} />
                </span>
                <Status value={q.status} />
              </div>
              <h3>{q.name}</h3>
              <p className="service-description">{q.description}</p>
              <div className="location">
                <MapPin size={14} />
                {q.location}
              </div>
              <div className="manage-facts">
                <span>{q.prefix} tokens</span>
                <span>{q.averageMinutes} min / visit</span>
                <span>Capacity {q.capacity}</span>
              </div>
              <div
                className="status-controls"
                aria-label={`Availability for ${q.name}`}
              >
                {[
                  ["open", Play, "Open"],
                  ["paused", Pause, "Pause"],
                  ["closed", X, "Close joins"],
                ].map(([value, Icon, label]) => (
                  <button
                    key={value}
                    className={q.status === value ? "selected" : ""}
                    disabled={busy || q.status === value}
                    onClick={() =>
                      action(
                        `/api/staff/queues/${q.id}/status`,
                        { status: value, version: q.version },
                        value === "paused"
                          ? "Service paused. Existing visits are kept."
                          : value === "closed"
                            ? "Closed to new visits. Staff can finish the existing queue."
                            : "Service is open.",
                        "PATCH",
                      )
                    }
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="manage-bottom">
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setModal({ type: "edit-service", queue: q })}
                >
                  <Settings2 size={16} />
                  Edit details
                </button>
                <button
                  className="icon-button archive"
                  aria-label={`Archive ${q.name}`}
                  disabled={
                    busy ||
                    q.status !== "closed" ||
                    q.waiting > 0 ||
                    Boolean(q.current)
                  }
                  title="Close the service and finish all active visits before archiving"
                  onClick={() => setModal({ type: "archive", queue: q })}
                >
                  <Archive size={17} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="settings-explanation">
        <Info size={19} />
        <p>
          <strong>Open, pause or close?</strong> Open accepts new visitors.
          Pause stops joins and new calls while keeping people’s places. Close
          joins lets staff finish the existing queue. Archive removes a closed,
          empty service while keeping its history.
        </p>
      </div>
    </>
  );
}
function ServiceForm({ queue: q, busy, save, close }) {
  const [values, setValues] = useState(
    q
      ? { ...q, requirements: q.requirements.join("\n") }
      : {
          name: "",
          prefix: "",
          location: "",
          description: "",
          requirements: "College ID",
          averageMinutes: 5,
          capacity: 30,
        },
  );
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({
          name: values.name,
          prefix: values.prefix,
          location: values.location,
          description: values.description,
          requirements: values.requirements,
          averageMinutes: Number(values.averageMinutes),
          capacity: Number(values.capacity),
        });
      }}
    >
      <div className="form-grid">
        <Field label="Service name">
          <input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            minLength={2}
            maxLength={60}
            required
            placeholder="e.g. Student support"
          />
        </Field>
        <Field
          label="Token prefix"
          hint="1–4 letters. Existing token numbers stay unchanged."
        >
          <input
            value={values.prefix}
            onChange={(e) => set("prefix", e.target.value.toUpperCase())}
            pattern="[A-Za-z]{1,4}"
            maxLength={4}
            required
            placeholder="SS"
          />
        </Field>
      </div>
      <Field label="Counter location">
        <input
          value={values.location}
          onChange={(e) => set("location", e.target.value)}
          minLength={2}
          maxLength={100}
          required
          placeholder="Building, floor and counter"
        />
      </Field>
      <Field label="What this service helps with">
        <textarea
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          minLength={5}
          maxLength={200}
          rows={2}
          required
        />
      </Field>
      <Field
        label="Documents to bring"
        hint="One requirement per line. Leave empty if none are needed."
      >
        <textarea
          value={values.requirements}
          onChange={(e) => set("requirements", e.target.value)}
          maxLength={400}
          rows={2}
        />
      </Field>
      <div className="form-grid">
        <Field
          label="Typical visit time (minutes)"
          hint="Used for estimates until enough visits are recorded."
        >
          <input
            type="number"
            value={values.averageMinutes}
            onChange={(e) => set("averageMinutes", e.target.value)}
            min={1}
            max={60}
            required
          />
        </Field>
        <Field
          label="Maximum active visitors"
          hint="Includes the visitor currently at the counter."
        >
          <input
            type="number"
            value={values.capacity}
            onChange={(e) => set("capacity", e.target.value)}
            min={1}
            max={200}
            required
          />
        </Field>
      </div>
      <p className="helper">
        If someone changes this service while you’re editing, close and reopen
        this form to review the latest details before saving.
      </p>
      <div className="modal-actions">
        <button
          className="button outline"
          type="button"
          onClick={close}
          disabled={busy}
        >
          Cancel
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? <Spinner /> : <Check size={17} />}Save service
        </button>
      </div>
    </form>
  );
}
function Display({ data, now, demo }) {
  return (
    <>
      <div className="display-header">
        <div>
          <span className="eyebrow">
            {demo ? "PRACTICE CAMPUS" : "CAMPUS SERVICES"}
          </span>
          <h1>One step closer.</h1>
          <p>Please go to your counter when your token is called.</p>
        </div>
        <span className="board-time">
          {new Intl.DateTimeFormat("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
          }).format(now)}
          <small>INDIA STANDARD TIME</small>
        </span>
      </div>
      <div className="display-grid">
        {data.queues.map((q) => (
          <section key={q.id} className={`display-card ${theme(q.prefix)}`}>
            <div>
              <h2>{q.name}</h2>
              <Status value={q.status} />
            </div>
            <span className="display-label">
              {q.current?.status === "called"
                ? "PLEASE COME TO THE COUNTER"
                : q.current
                  ? "NOW IN SERVICE"
                  : "COUNTER READY"}
            </span>
            <strong
              className={q.current?.status === "called" ? "called-number" : ""}
            >
              {q.current?.token || "—"}
            </strong>
            <span className="location">
              <MapPin size={16} />
              {q.location}
            </span>
            <div className="display-card-bottom">
              <span>{q.waiting} waiting</span>
              <span>
                {q.current ? cap(q.current.status) : "No current visit"}
              </span>
            </div>
          </section>
        ))}
      </div>
      <p className="directory-note">
        <ShieldCheck size={15} />
        Only token numbers are shown here. Visitor names and account details
        stay private.
      </p>
    </>
  );
}
function StaffEntry({ signIn, startDemo, busy }) {
  return (
    <>
      <PageTitle
        eyebrow="STAFF PORTAL"
        title="Good service starts here."
        copy="Call the next visitor, help them through their visit and keep the queue moving."
      />
      <div className="staff-entry panel">
        <span className="service-icon">
          <LayoutDashboard size={30} />
        </span>
        <h2>Your counter, clearly organised.</h2>
        <p>
          Sign in with your staff account. For a classroom walkthrough, the
          practice workspace includes a ready-to-use staff desk and fictional
          visitors.
        </p>
        <div>
          <button className="button primary" onClick={signIn}>
            Staff sign in
            <ArrowRight size={17} />
          </button>
          <button
            className="button outline"
            onClick={startDemo}
            disabled={busy}
          >
            {busy ? <Spinner /> : <Play size={17} />}Try the practice workspace
          </button>
        </div>
      </div>
    </>
  );
}
