# CD Companion — Community Locales

This folder contains the built-in locale files shipped with the overlay.

| File | Language |
|------|----------|
| `en.json` | English (fallback, always loaded) |
| `pt-BR.json` | Português (Brasil) |

---

## Adding a new language

1. **Do not edit this folder.** These files are embedded inside `CD_Companion.exe`
   and are read-only at runtime.

2. Create a `locales/` folder **next to `CD_Companion.exe`**:

   ```
   CD_Companion.exe
   locales/
   └── fr.json
   ```

3. Copy `en.json` as a starting point and fill in your translations.

4. Set `_language_name` and `_language_code` at the top:

   ```json
   {
     "_language_name": "Français",
     "_language_code": "fr",

     "settings.save": "Enregistrer",
     "settings.cancel": "Annuler"
   }
   ```

5. Launch the overlay. Your language will appear in **Settings > Window > Language**.

---

## Notes

- **Partial translations are fine.** Any missing key falls back to English automatically.
- **Keys with `_` prefix** (`_language_name`, `_language_code`) are metadata and are
  never shown as translation strings.
- **Placeholders** like `{0}` are positional values filled in at runtime. Keep them
  as-is in your translation.
  Example: `"panel.realm": "Realm: {0}"` → `"panel.realm": "Royaume: {0}"`
- Your external locale file takes precedence over the built-in one if both share the
  same `_language_code`. This lets you override the shipped English or Portuguese if
  needed.

---

## Contributing

To include your translation in a future release, open a pull request at
[github.com/leandrodiogenes/cd-companion](https://github.com/leandrodiogenes/cd-companion)
with your JSON file added to `overlay/locales/`.
