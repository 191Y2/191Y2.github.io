/* ============================================================
   APP CONFIG — THE ONLY FILE YOU EVER NEED TO EDIT
   ============================================================

   1) PROXY SERVER (wisp) URL
      Your Render server is already set as the default below.
      If you ever deploy a new one, paste it between the quotes
      (https:// gets auto-converted to wss:// by the app, and the
      trailing slash is added for you — so any format works).

      Backup (free public server, use if yours is down):
      wss://wisp.mercurywork.shop/

      You can also change this INSIDE the app:
      gear icon -> Settings -> Proxy server URL (no file editing).
*/
const WISP_URL = "wss://wisp-yrxl.onrender.com/";

/* 2) ACCESS KEY (the "cloak")
      You are asked ONCE per device, then never again (until you
      hit "Forget the access key" in Settings).

      CURRENT ACCESS KEY:   MMA2026        (no dash, capitals)

      To change it: open the site, F12 -> Console, run this with
      your new key inside the quotes:
      crypto.subtle.digest("SHA-256", new TextEncoder().encode("YOUR-NEW-KEY")).then(h => console.log([...new Uint8Array(h)].map(b => b.toString(16).padStart(2,"0")).join("")))
      Copy the printed hash and replace the string below.
*/
const CLOAK_HASH = "fb9749bdb677d3d489bc0497285999f7527e4d1b35e71b9e30b501c3120d18a4";
