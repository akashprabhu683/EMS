import { spawn } from 'child_process';

const proc = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless',
  '--remote-debugging-port=9222',
  '--disable-gpu',
  '--no-first-run',
  'http://localhost:5173/'
]);

await new Promise(r => setTimeout(r, 1500));

try {
  const res = await fetch('http://127.0.0.1:9222/json');
  const tabs = await res.json();
  const pageTab = tabs.find(t => t.url.includes('5173')) || tabs[0];
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  // Enable Page domain and navigate
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await new Promise(r => setTimeout(r, 2000));
  const evalResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const footer = document.querySelector('footer');
      const navLinks = document.querySelectorAll('header nav a');
      const bentoPromoWarm = document.querySelector('.bento-promo-warm');
      const benefits = document.querySelectorAll('.benefit-grid .bento-card');
      const productCard = document.querySelector('.product-card');
      const body = document.body;

      return {
        footerFound: !!footer,
        footerText: footer ? footer.innerText.slice(0, 100) : null,
        footerDisplay: footer ? window.getComputedStyle(footer).display : null,
        footerMarginTop: footer ? window.getComputedStyle(footer).marginTop : null,
        bentoWarmPadding: bentoPromoWarm ? window.getComputedStyle(bentoPromoWarm).padding : null,
        productCardPadding: productCard ? window.getComputedStyle(productCard).padding : null,
        productCardBodyPadding: productCard ? window.getComputedStyle(productCard.querySelector('.product-card__body')).padding : null,
        firstBenefitPadding: benefits[0] ? window.getComputedStyle(benefits[0]).padding : null,
        navLinkPadding: navLinks[1] ? window.getComputedStyle(navLinks[1]).padding : null,
      };
    })()`,
    returnByValue: true
  });

  console.log('DOM Evaluation:', JSON.stringify(evalResult.result.value, null, 2));

  // Also check console errors
  ws.close();
} finally {
  proc.kill();
}
