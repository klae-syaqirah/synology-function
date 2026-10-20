# Synology Package Guide — KLAE Group

An internal web page that explains every package in our Synology NAS Package Center:
what it does, which department it is for, how KLAE can use it, and how to start using it.
Staff can share a direct link to any package, department or filtered list.

Plain HTML, CSS and JavaScript. No build step and no server code. Content is edited in a **Google Sheet**.

## Features

- **Overview**: search box, quick stats, "What do you want to do?" task list, departments and the everyday apps for staff.
- **All packages**: search and filter by department, company stance, who uses it, category and source
  (plus install status in the internal version).
  The filters are kept in the URL, so **Copy link to this view** shares exactly what you see.
- **Package page** (`#/app/<id>`): icon, description, how each department can use it, step-by-step how-to, tips,
  dependencies (what it needs and what needs it), related packages, latest version, a Synology Knowledge Center link
  and a print button.
- **Department page** (`#/dept/<id>`): apps the team uses directly, services IT runs for them, and developer tools.
- **Guide & policy**: getting started, package policy, label legend, FAQ, glossary, IT contact.
- **Google Sheet as the database**, with a saved copy in the browser and an offline copy shipped with the site
  if the sheet cannot be reached.

## Run it locally

Any static web server works. From the project folder:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly also works, but only with the offline copy.

## Connect the Google Sheet

1. Create a new Google Sheet.
2. For each file in `data/csv/` (`settings`, `apps`, `departments`, `tasks`, `glossary`, `faq`):
   **File > Import > Upload**, choose the file, set **Import location** to **Insert new sheet(s)**,
   untick **Convert text to numbers, dates, and formulas**, then **Import data**.
   Each tab must be named exactly like the file (without `.csv`). Delete the empty `Sheet1`.
3. **Share > General access > Anyone with the link > Viewer.**
4. Copy the ID from the sheet URL — `https://docs.google.com/spreadsheets/d/`**`THIS-PART`**`/edit` —
   into `googleSheetId` in [config.js](config.js).
5. Reload the site. The footer should say **Content: live from Google Sheet**.

If your Google Workspace does not allow "Anyone with the link", use **File > Share > Publish to web**,
publish each tab as **Comma-separated values (.csv)** and paste the six links into `publishedCsv` in `config.js`.

> Anyone who has the site can read the sheet. Never put passwords, licence keys, NAS addresses, install status or
> other internal details in it — see [Public site vs. our NAS status](#public-site-vs-our-nas-status).

## Editing content

Edit the sheet, then refresh the page. In multi-line cells put each item on its own line (**Alt+Enter**).

### `apps` tab

| Column | What to put |
| --- | --- |
| `id` | Short unique ID used in links, e.g. `hyper-backup`. Don't change it once people have shared links. |
| `name` | Name as shown in Package Center. |
| `icon` | `icons/<id>.png`, or any image URL. If empty or broken, the initials are shown. |
| `section` | `Synology` or `Open Source` (the Package Center group). |
| `developer` | Developer shown on the package page, e.g. `Synology Inc.`, `php.net`. |
| `publisher` | Publisher shown on the package page (`Synology Inc.` for everything in the official Package Center). |
| `category` | Comma-separated, e.g. `Backup, Business`. |
| `on_our_nas` | `Installed`, `Update available` or `Not installed`. **Leave empty on the public site.** |
| `approval` | `Approved`, `IT approval needed` or `Not recommended`. |
| `approval_note` | One sentence explaining the stance. |
| `user_type` | `End user`, `IT admin` or `Developer`. |
| `departments` | Comma-separated department IDs from the `departments` tab, or `all`. |
| `summary` | One line for the cards. |
| `description` | What it is. |
| `use_cases` | One per line, `Department: how they use it`. |
| `how_to` | One step per line. |
| `tips` | One tip per line. |
| `access` | Comma-separated, e.g. `DSM web (Main Menu), Desktop app, Mobile app`. |
| `related` | Comma-separated package IDs. |
| `depends_on` | Package IDs this package needs (Package Center > package > **Dependent Packages**). "Required by" is worked out automatically. In the internal version, installed packages that others need get a "Do not uninstall" warning. |
| `keywords` | Extra search words, e.g. `cctv, camera`. |
| `installed_version` | Version installed on our NAS (Package Center > package > **Installed version**). **Leave empty on the public site.** |
| `version` | Newest online version. If it differs from `installed_version`, the page shows "update waiting". |
| `learn_more` | Optional link. Empty = Synology Knowledge Center search for the package name. |

### Other tabs

- `departments`: `id`, `name`, `description`. Row order = display order.
- `tasks`: `group`, `task`, `description`, `apps` (comma-separated package IDs).
- `glossary`: `term`, `meaning`.
- `faq`: `question`, `answer`.
- `settings`: `key`, `value` (the `note` column is just for you). Company name, intro text, logo, NAS address,
  getting-started steps, policy text and IT contact details live here.

### Adding a package

Add a row to `apps` with a new `id`, and save its icon as `icons/<id>.png` (around 64–128 px, white or transparent background).

## Hosting

### GitHub Pages (public)

The site is published from this repository: **Settings > Pages > Deploy from a branch > `main` / `(root)`**.
It is then live at `https://klae-syaqirah.github.io/synology-function/`. Anyone on the internet can read it.

### Public site vs. our NAS status

The public site only contains general content: what each package does, how KLAE departments can use it, how-to steps
and the company stance. It deliberately leaves out the state of our own NAS — what is installed, installed versions,
pending updates and "do not uninstall" warnings — because that tells outsiders where the NAS is weak.

- `settings` > `show_nas_status` is `no` on the public site, and the `on_our_nas` / `installed_version` columns are empty.
- The full internal copy, with NAS status, lives in `private/csv/` (git-ignored, never pushed). Open it in Excel,
  or build an internal offline copy with `node tools/build-local-data.mjs private/csv private/local-data.js`.
- To run an internal version (for example on the NAS, below), use the private data and set `show_nas_status` to `yes`.
  **Never** set it to `yes` or fill those columns in the public sheet or `data/csv`.
- Do not put the NAS address, phone extensions or anything internal in the public sheet's `settings` tab.

### On the NAS (Web Station, internal only)

1. In Web Station (Package Center), check under **Web Service Portal** that the default server is running.
2. Copy the project files (everything except `.git`, `tools` and `private`) into a folder in the `web` shared folder,
   e.g. `web/synology-guide/`.
3. Open `http://<nas-address>/synology-guide/` from the office network.

## Refreshing the offline copy

The site falls back to `data/local-data.js` when the sheet cannot be reached. To bring it up to date:

1. In the sheet, **File > Download > Comma-separated values** for each tab and save over the files in `data/csv/`.
2. Run `node tools/build-local-data.mjs`.

## Project structure

```
index.html              page shell
config.js               Google Sheet connection (the only file you normally edit in code)
assets/css/styles.css   styling; brand colour is --brand at the top
assets/js/csv.js        CSV parser
assets/js/data.js       loads the sheet / saved copy / offline copy and tidies the data
assets/js/app.js        pages, filters and links
data/csv/*.csv          content in sheet format (import these into Google Sheets)
data/local-data.js      offline copy, generated from data/csv
icons/                  package icons
tools/                  build script for the offline copy
```
