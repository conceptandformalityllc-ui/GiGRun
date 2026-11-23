# GigRun

An Android app for quick local work: lawn care, car washes, moving help, junk hauling, cleaning, handyman jobs. It ranks every job by what you would actually keep per hour, after driving and gear.

## Get the APK onto your phone

**Option A: no software to install (GitHub builds it for you)**

1. Make a free GitHub account and create a new empty repository.
2. Upload the contents of this folder to it (drag the files into the repository page, or `git push`). Keep the `.github` folder.
3. Open the repository's **Actions** tab, choose **Build APK**, and wait about 3 minutes.
4. Open the finished run, download **GigRun-debug-apk**, unzip it, and send `app-debug.apk` to your phone.
5. On the phone, open the file and allow "Install unknown apps" when asked.

**Option B: Android Studio**

1. Install Android Studio, then **File > Open** and pick this folder.
2. Let it sync, plug in your phone (USB debugging on), and press **Run**.
   Or **Build > Build APK(s)**; the file lands in `app/build/outputs/apk/debug/`.

Needs Android 10 or newer.

## What is in the app

| Tab | What it does |
| --- | --- |
| Jobs | Open jobs with category, miles away, pay, travel cost, gear cost, time, effort and net dollars per hour. Accept, Decline, Info. Filter by category, sort by best $/hr, closest, highest pay, newest. **Add job** takes a pasted listing and fills in pay, phone, email, hours and category. |
| Map | Pins for every job, your position, the miles from you to a job and to the nearest other jobs. **Route** orders your accepted jobs to drive, with miles between each, fuel and wear cost, and net per hour for the whole run. |
| My jobs | Accepted jobs with **Go** (turn-by-turn in Google Maps), Call, Text, Done. Last 7 days: net earned, hours, net per hour, miles. |
| People | Every customer you accept. Star rating, tags (hard to work with, generous, keep in touch...), notes, follow-up reminders that arrive as phone notifications. |
| You | Your name, vehicle (mpg, gas price, wear), goal $/hr, base address, and the gear you own. |

**Finish job** records what you were paid, tip, hours, rates the customer, and sets a reminder. **Save + review** hands the phone to the customer for a selfie, stars, a short review and a song. The result plays as an animated card with the song preview, prints "Done by [your name]", and exports as a 1080 x 1920 image you can share.

## How the numbers work

- Road miles are straight-line miles times 1.3.
- Travel cost per mile = gas price / mpg + wear per mile. You set all three under **You**.
- Gear cost = the day-rental price of each tool the job needs that you do not own. Mark tools you own and the cost drops to $0. Prices are typical US figures; edit them.
- Net per hour = (pay - travel - gear - supplies) / (work hours + drive hours).
- Worth it means net per hour is at or above your goal. Marginal is within 70% of it. Skip it is below that, or a net loss.
- Hours and effort for a new job start as an estimate from the category and size, and you can overwrite them.

## What it does not do yet

- **No live job feed.** The 12 jobs you see at first are labelled Sample. Real ones come in through **Add job** (paste an ad from Craigslist, Facebook, a text). Craigslist, Facebook and TaskRabbit have no free public job API, so a live feed needs your own source or a paid data service. Everything funnels through one function (`openAddJob` / the job object in `js/data.js`) when you want to plug one in.
- **Spotify search.** Spotify requires a developer key to search songs. Apple Music search works with 30-second previews and no key. For Spotify, paste a song link and it plays in Spotify's own player.
- **Map tiles** come from OpenStreetMap, which is fine for personal use. For a published app, switch `tileUrl` in `js/map.js` to a paid tile provider.
- Data lives on the phone only. Use **You > Copy backup** to save it.

## Layout

```
app/src/main/assets/www/      the whole app (HTML, CSS, JavaScript)
  js/data.js                  job catalog, gear prices, money math, sample data, storage
  js/map.js                   the map (tiles, pins, route lines, pinch zoom)
  js/app.js                   job cards and the five tabs
  js/sheets.js                job info, add job, finish job, customer, backup
  js/review.js                selfie, song search, review card, share image
app/src/main/java/...         Android shell: WebView, GPS and camera permission, Go button,
                              reminder notifications, saving and sharing the review image
.github/workflows/            builds the APK on GitHub
```

To change the app, edit the files under `assets/www`. You can open `assets/www/index.html` in a desktop browser to try changes quickly; the Android-only parts (Go, reminders, sharing) fall back to web behavior there.
