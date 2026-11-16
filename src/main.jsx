import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <img src="/icon.svg" alt="QueueFlow" width="54" />
        <h1>Let’s get you back in the flow.</h1>
        <p>
          The page couldn’t finish loading. Your saved visit stays on the
          server.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Reload QueueFlow
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
