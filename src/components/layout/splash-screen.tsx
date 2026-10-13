import { LogoMark } from "./logo-mark";

/** sessionStorage key: the splash plays once per browser session, not on every full page load. */
export const SPLASH_SEEN_KEY = "ve:splash-seen";

/**
 * Runs before first paint (it sits at the top of <body>): marks <html> when
 * the splash already played this session so CSS hides it immediately, and
 * records that it has now played. Storage failures (private mode) just mean
 * the splash plays again; they never block the page.
 */
const SPLASH_SCRIPT = `try{var k=${JSON.stringify(SPLASH_SEEN_KEY)};if(sessionStorage.getItem(k)){document.documentElement.dataset.splash="seen"}else{sessionStorage.setItem(k,"1")}}catch(e){}`;

/**
 * Branded launch screen. It is pure CSS: it fades out on its own and never
 * intercepts clicks after that, so a slow or failed script cannot trap the
 * player behind it. Decorative only, so assistive tech skips it.
 */
export function SplashScreen() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
      <div aria-hidden className="splash-screen">
        <div className="splash-screen__content">
          <LogoMark className="splash-screen__mark size-20" />
          <p className="text-xl font-bold tracking-tight">Virtual Earn</p>
          <p className="text-xs text-muted">Tap, earn, cash out</p>
          <span className="splash-screen__bar" />
        </div>
      </div>
    </>
  );
}
