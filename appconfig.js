/* ============================================================
   APP CONFIG — THIS IS THE ONLY FILE YOU EVER NEED TO EDIT
   ============================================================

   1) PROXY SERVER (wisp) URL
      Paste your server between the quotes. It must start with wss://
      (after you deploy the "wisp-server" folder on Render, you get a
      link like https://wisp-xxxx.onrender.com -> change https:// to wss://
      and keep the trailing slash, e.g. "wss://wisp-xxxx.onrender.com/")

      The free public one below works for testing right now.
      NOTE: you can also change the server INSIDE the app
      (gear icon -> Settings) without touching this file at all.
*/
const WISP_URL = "wss://wisp.mercurywork.shop/";

/* 2) ACCESS KEY (the "cloak")
      Only people who know the key can open your link. Anyone else gets
      redirected to Google. The app never stores the key itself — only
      the hash below, so nobody can read it out of your code.

      The hash below belongs to the key:  MMA-2026
      So for now, your access key is:  MMA-2026   (type it exactly,
      capital letters and the dash included)

      To change the key later: open your site, press F12, go to Console,
      and run this with YOUR new key inside the quotes:
      crypto.subtle.digest("SHA-256", new TextEncoder().encode("YOUR-NEW-KEY")).then(h => console.log([...new Uint8Array(h)].map(b => b.toString(16).padStart(2,"0")).join("")))
      Then copy the printed hash and replace the string below.
*/
const CLOAK_HASH = "2042762a6381dbd1320892fa277572ff87b00bf60b393696ed70d37077f40b94";
