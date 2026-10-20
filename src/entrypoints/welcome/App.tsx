import logo from "@/assets/fukidashi.png";
import { t } from "@/services/i18n";
import "./App.css";

/**
 * What a new user sees once, right after installing: how a note is made, the
 * two things that would otherwise surprise them, and where their notes live.
 * The page cannot be annotated itself — no extension page can — so it shows
 * a highlight rather than offering one.
 */
function App() {
  const steps = [
    { title: t("welcomeSelectTitle"), body: t("welcomeSelectBody") },
    { title: t("welcomeMarkTitle"), body: t("welcomeMarkBody", { addNote: t("addNote") }) },
    { title: t("welcomeReadTitle"), body: t("welcomeReadBody") },
  ];

  return (
    <main className="fk-welcome">
      <header className="fk-welcome__header">
        <img src={logo} className="fk-welcome__logo" alt="" />
        <h1 className="fk-welcome__title">{t("welcomeTitle")}</h1>
        <p className="fk-welcome__lead">{t("welcomeLead")}</p>
      </header>

      <figure className="fk-demo" aria-hidden="true">
        <span className="fk-demo__bubble">{t("welcomeDemoMemo")}</span>
        <p className="fk-demo__text">
          <mark className="fk-demo__mark">{t("welcomeDemoHighlight")}</mark>
          {t("welcomeDemoRest")}
        </p>
      </figure>

      <ol className="fk-steps">
        {steps.map((step, index) => (
          <li key={step.title} className="fk-step">
            <span className="fk-step__number">{index + 1}</span>
            <div>
              <h2 className="fk-step__title">{step.title}</h2>
              <p className="fk-step__body">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="fk-welcome__tips">
        {/* Firefox puts the content script into the tabs already open; Chrome does not. */}
        {!import.meta.env.FIREFOX && <p>{t("welcomeOpenTabs")}</p>}
        <p>{t("welcomePin")}</p>
      </section>

      <section className="fk-welcome__card">
        <h2 className="fk-welcome__card-title">{t("welcomePrivacyTitle")}</h2>
        <p className="fk-welcome__card-body">{t("welcomePrivacyBody")}</p>
        <button
          type="button"
          className="fk-welcome__button"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          {t("welcomeOpenSettings")}
        </button>
      </section>
    </main>
  );
}

export default App;
