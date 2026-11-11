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

Lisans: MIT
