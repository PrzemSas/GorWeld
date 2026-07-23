# GORWELD Retro Drop — dla tych, którzy byli tu pierwsi

**Snapshot: 22 lipca 2026. Nie ma nic do odbierania, nie ma się do czego zapisywać. To już jest rozstrzygnięte.**

## Zasada, w jednym zdaniu

> **Ile procent podaży GorWeldd trzymasz, tyle procent podaży GORWELD dostajesz na Solanie.**

To cały mechanizm. Żadnych progów, punktów, mnożników, krzywych wagowych ani formularzy zgłoszeniowych. Twój przydział wynika z danych on-chain i arytmetyki — a nie z czyjejś oceny, na ile zasługujesz.

## Dlaczego retroaktywnie

Snapshot ma datę wsteczną. Nie było wcześniej żadnego ogłoszenia i nie ma sposobu, żeby się zakwalifikować po fakcie. Nikt tego nie wyfarmił, bo nie było czego farmić — zanim to czytasz, lista uprawnionych jest już zamrożona.

## Jak liczyliśmy

**Jeden portfel = jedno saldo.** GorWeldd istnieje pod tym samym mintem na CookieChain i na Gorbaganie. To jedno lustrzane wdrożenie, nie dwa osobne tokeny — z 63 portfeli obecnych na obu sieciach 49 miało salda identyczne co do jednostki. Dlatego sald **nie sumujemy**. Każdy portfel liczony jest według **większej ze swoich dwóch pozycji**: liczysz się z Gorbagany albo z Cookie, nigdy z obu naraz.

Ponieważ obie sieci i Solana to SVM, Twój adres jest wszędzie ten sam. Nie ma czego łączyć, nie ma czego mostkować, nie trzeba podpinać portfela.

**Podstawa podaży** (jednostki UI, 6 miejsc; snapshot 2026-07-22, odtwarzalny z zapytania RPC w sekcji *Sprawdź to sam* poniżej):

| | GorWeldd | udział |
|---|---:|---:|
| Łącznie (większe z dwóch sieci, per portfel) | 1 011 041 101 400,691694 | 100% |
| Spalone | −501 000 022 873,757726 | 49,55% |
| Wykluczony holder (patrz niżej) | −100 000 000 000 | 9,89% |
| **Mianownik** | **410 041 078 526,933968** | |

Spalone i wykluczone tokeny wypadają z mianownika, bo nigdy nikt ich nie odbierze. Zostawienie ich oznaczałoby po cichu spisanie na straty większości dystrybucji.

Portfele zespołu **i konta programowe zostają w mianowniku** — te tokeny istnieją jako żywa pozycja — ale **nie dostają nic**.

## Co jest wykluczone i dlaczego

- **Adres spalania** — tych tokenów nie ma, nie mogą niczego otrzymać.
- **Portfele zespołu** — projekt nie robi airdropu sam sobie.
- **Jeden holder**, którego pozycja jest przedmiotem nierozstrzygniętego sporu z projektem.
- **Pięć adresów sterowanych przez programy** — skarbce puli płynności i konto routera. Wszystkie pięć jest off-curve, czyli nie istnieje do nich klucz prywatny. To nie są ludzie. Tokeny tam wysłane trafiłyby pod kontrolę programu zamiast do posiadacza.

Kryterium jest jedno: krzywa ed25519. Off-curve znaczy brak klucza prywatnego, czyli brak właściciela. To, do jakiego programu należy konto systemowe danego portfela, **nie** dyskwalifikuje nikogo — realny holder, którego konto zostało przypisane do innego programu, wypadł przy wcześniejszym przebiegu i został przywrócony.

Metodę zwalidowaliśmy przed użyciem: 77 z 78 prawdziwych kont tokenowych wyszło off-curve, a 200 losowych ciągów bajtów rozłożyło się 50/50 — czyli test naprawdę rozróżnia, a nie oznacza wszystkiego jak leci.

## Wynik

| | |
|---|---:|
| Odbiorcy | **55** |
| Rozdane łącznie | **15 079 241,815305 GORWELD** |
| Udział w podaży GORWELD | **1,5079%** |
| Wypłacone | **23 lipca 2026 — zakończone** |

**To już się stało.** Wszystkie 55 przelewów wykonano 23 lipca 2026 i zweryfikowano on-chain po fakcie: saldo każdego odbiorcy zgadza się z planem co do jednostki. Jeśli byłeś uprawniony, tokeny są już w Twoim portfelu — po prostu sprawdź.

Tokeny poszły bezpośrednio na Twój adres na Solanie. **Nie ma żadnej strony do odbioru, żadnej prośby o podpis i żadnego serwisu, który przy tym dropie poprosi Cię o podłączenie portfela.** Kto o to prosi — to nie my.

## Sprawdź to sam

Nie musisz wierzyć w nic z powyższego. Wszystkie dane wejściowe są publiczne.

Pobierz zbiór holderów z dowolnej z sieci:

```bash
curl -s -X POST https://rpc.cookiescan.io/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getProgramAccounts","params":[
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    {"encoding":"jsonParsed","filters":[
      {"dataSize":165},
      {"memcmp":{"offset":0,"bytes":"GCQ4NYEd2P8vRFDn9wadeE1KAPfckWpzJUUyzTqyimG7"}}]}]}'
```

To samo zapytanie na `https://rpc.gorbagana.wtf/` dla drugiej sieci. Weź większe saldo per właściciel, odejmij od sumy spalone i wykluczone, podziel.

Twój przydział (arytmetyka całkowita na raw, 6 miejsc — tak samo jak skrypt wypłaty):

```
twoje_GORWELD_raw = twoje_GorWeldd_raw × 1_000_000_000_000_000 / 410_041_078_526_933_968
twoje_GORWELD     = twoje_GORWELD_raw / 1_000_000
```

W jednostkach UI to ten sam udział:

```
twoje_GORWELD ≈ twoje_GorWeldd / 410_041_078_526.933968 × 1_000_000_000
```

**Adresy:**
- mint GorWeldd (obie sieci): `GCQ4NYEd2P8vRFDn9wadeE1KAPfckWpzJUUyzTqyimG7`
- mint GORWELD (Solana): `A8cDgfn1tAQbsZfD8oZU5u2xZZqKtJTmq7m9E3PLNMqr`

## Czym to nie jest

To nie jest obietnica dotycząca ceny, listingów ani tego, ile GORWELD będzie wart. To rozdysponowanie ustalonego procentu podaży na adresy, które już wcześniej trzymały poprzedni token, wykonane według reguły, którą każdy może sobie przeliczyć.

Reszta puli nagród zostaje na późniejszą fazę, finansowaną z creator fee z handlu — tak, żeby dystrybucja brała się z aktywności, a nie z jednorazowej rozdawki.

---

*From scrap to chain. Brick by brick.*
