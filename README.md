# hackatlas

Türkiye'deki ve dünyadaki hackathonları tek yerde, aynı düzende gösteren site. Her etkinlikte aynı bilgiler aynı
yerde durur: son başvuru, tarih, yer, ödül, takım büyüklüğü, kimler katılabilir, organizatör ve kaynak.

Veri her gün hazır listelerden (Devpost, MLH, Devfolio, Techcareer), web aramasından ve sosyal medyadan toplanır.
Yeni kayıtlar bir pull request olarak gelir; ekip onaylayınca yayına girer.

Bir hackathon eksik mi? [Ekleme formunu](../../issues/new?template=add-hackathon.yml) doldurun.

## Geliştirme

```bash
cd collector && uv venv && uv pip install -e ".[dev,llm]" && .venv/bin/pytest
cd site && pnpm install && pnpm dev
```

## Kurulum notları

- **Günlük toplama:** `.github/workflows/collect.yml` her gün 05:00 UTC'de çalışır, yeni adayları `bot/collect`
  dalından bir PR olarak açar. PR'ı birleştirmek onay demektir; istemediğiniz kaydı PR'dan silin ya da
  `hackatlas reject <id>` ile kalıcı olarak reddedin.
- **Web ve sosyal medya araması:** repo ayarlarında `ANTHROPIC_API_KEY` secret'ı tanımlanınca açılır (Claude Haiku,
  web arama aracı). Anahtar yoksa bu kaynak atlanır, diğerleri çalışır.
- **Instagram:** toplama bu repo dışında, oturum açık bir tarayıcısı olan makinede yapılır. Her satırda bir gönderi
  olan bir JSONL dosyası (`short_code`, `caption`, `owner_username`, `timestamp`) şununla işlenir:
  `HACKATLAS_IG_EXPORT=posts.jsonl hackatlas collect --sources instagram`, sonra `hackatlas review`.
- **Yayın:** `.github/workflows/deploy.yml` main'e her veri ya da site değişikliğinde GitHub Pages'e yayınlar
  (Settings > Pages > Source: GitHub Actions).

Lisans: MIT
