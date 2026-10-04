# Battle Weld — instalacja serwera na Ubuntu 24.04

Ta instrukcja przygotowuje pojedynczy proces Battle API za Caddy. Battle lock
i hub SSE są trzymane w pamięci procesu, więc nie uruchamiaj wielu workerów ani
replik API. API zapisuje stan w plikach JSON w `/var/lib/battleweld`.

Zgodnie z §14.1 dane gracza (nick, nagranie rundy i czasy) opuszczają jego
urządzenie dopiero po świadomej zgodzie w Battle. Przed wystawieniem publicznego
endpointu opublikuj politykę prywatności z celem przetwarzania i retencją:
nagrania 30 dni, wynik pojedynku do 180 dni od werdyktu/wygaśnięcia, a
niedokończone pojedynki 7 dni. Tę instrukcję można przygotować wcześniej; samo
jej wykonanie nie zastępuje publikacji polityki.

## 1. Konto administracyjne i SSH

Zaloguj się na nowy VPS przez konto administratora skonfigurowane przez
dostawcę. Dodaj własny klucz SSH do `~/.ssh/authorized_keys`, sprawdź nowe
połączenie w drugim terminalu, a dopiero wtedy wyłącz logowanie hasłem i
rootem w `/etc/ssh/sshd_config`:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Sprawdź konfigurację (`sudo sshd -t`) i przeładuj SSH (`sudo systemctl reload
ssh`). Zachowaj aktywną sesję aż nowe logowanie kluczem zadziała.

## 2. Aktualizacje i firewall

```sh
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y ufw unattended-upgrades ca-certificates curl gnupg
sudo dpkg-reconfigure -plow unattended-upgrades
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Upewnij się, że dostawca VPS pozwala na SSH oraz TCP 80/443 w swojej zaporze.
Portu 8899 nie otwieraj publicznie; Node nasłuchuje tylko na loopback.

## 3. Node.js 22 LTS z oficjalnego repozytorium NodeSource

Instrukcje repozytorium NodeSource dla Node 22 są w
[oficjalnym skrypcie `setup_22.x`](https://github.com/nodesource/distributions/blob/master/scripts/deb/setup_22.x).
Na Ubuntu 24.04:

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version
```

Oczekiwany główny numer wersji to `v22`.

## 4. Caddy z oficjalnego repozytorium

Użyj poleceń z [oficjalnej instrukcji instalacji Caddy dla Debian/Ubuntu](https://caddyserver.com/docs/install):

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Utwórz rekord DNS `A` dla `api.gorweldarc.com` wskazujący na VPS. Dodaj rekord
`AAAA` tylko wtedy, gdy serwer ma działającą publiczną łączność IPv6.
Ustaw rekord Cloudflare na **DNS only** (szara chmurka). Jeśli proxy
Cloudflare (pomarańczowa chmurka) zostanie włączone, API zobaczy IP Cloudflare,
a limity per IP zleją się w limit wspólny dla klientów. Obsługa proxy wymaga
wcześniejszej konfiguracji zaufanych proxy i `CF-Connecting-IP`; obecny serwer
tego nagłówka nie interpretuje.

## 5. Użytkownik, katalogi i konfiguracja

```sh
sudo useradd --system --home-dir /opt/battleweld --shell /usr/sbin/nologin battleweld
sudo install -d -o root -g root -m 0755 /opt/battleweld/battle-server
sudo install -d -o root -g root -m 0755 /opt/battleweld/arc
sudo install -d -o battleweld -g battleweld -m 0700 /var/lib/battleweld
sudo install -o root -g root -m 0600 battle-server/deploy/battleweld.env.example /etc/battleweld.env
```

Utwórz `/etc/battleweld.env` z wartościami z przykładu. Nie dodawaj sekretów
ani danych dostępowych — konfiguracja API ich nie wymaga. Właściciel katalogu
magazynu musi pozostać `battleweld`; pliki pojedynków mają tryb `0600`.

## 6. Instalacja usług i pierwszy deploy

Skopiuj z repozytorium szablon jednostki i Caddyfile, a następnie sprawdź
konfigurację przed uruchomieniem usług:

```sh
sudo install -o root -g root -m 0644 battle-server/deploy/battleweld.service /etc/systemd/system/battleweld.service
sudo install -o root -g root -m 0644 battle-server/deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable battleweld caddy
```

Na komputerze z checkoutem wykonaj najpierw jawny dry-run:

```sh
bash battle-server/deploy/deploy.sh <ssh-host> --dry-run
```

Po sprawdzeniu listy plików rzeczywiste przesłanie i restart wymaga jawnego
wywołania:

```sh
bash battle-server/deploy/deploy.sh <ssh-host>
```

Skrypt kopiuje `battle-server/` bez testów oraz `arc/sim.js` i `arc/battle.js`
do `/opt/battleweld`, po czym restartuje usługę i odpytuje lokalne `/health`.
Skrypt nie uruchamia instalacji ani konfiguracji serwera.

Po deployu aktywuj lub przeładuj Caddy:

```sh
sudo systemctl restart caddy
sudo systemctl status battleweld caddy --no-pager
curl --fail https://api.gorweldarc.com/health
sudo journalctl -u battleweld -n 50 --no-pager
```

`GET /health` publikuje wyłącznie status i wersje ARC. Logi żądań używają
szablonów tras bez ID pojedynku i bez surowych IP.

## 7. Aktualizacja i rollback

Przed zmianą zachowaj kopię poprzedniego katalogu kodu. Ponowny deploy aktualizuje
kod i restartuje usługę, ale nie kopiuje ani nie usuwa `/var/lib/battleweld`.
Rollback polega na przywróceniu poprzednich plików kodu z kopii i restarcie:

```sh
sudo systemctl restart battleweld
curl --fail http://127.0.0.1:8899/health
```

ARC ma stałą `BATTLE_PROD_API = null`, więc publiczna strona pozostaje w trybie
przyjaznym. Przy rollbacku zmiany klienta utrzymuj tę stałą jako `null`.

## 8. Kopia danych

Wykonuj regularną kopię katalogu `/var/lib/battleweld` do zaszyfrowanego,
ograniczonego dostępu celu. Zatrzymaj usługę albo użyj snapshotu systemu
plików, aby kopia zawierała spójny stan:

```sh
sudo systemctl stop battleweld
sudo tar --numeric-owner -czf /root/battleweld-data-$(date +%F).tar.gz -C /var/lib battleweld
sudo systemctl start battleweld
```

Przechowuj kopie według przyjętej polityki dostępu i retencji, a odtworzenie
sprawdź najpierw w odizolowanym środowisku. W pojedynczym procesie nie ma
automatycznej replikacji; zabezpiecz także klucz SSH administratora i dostęp
do kopii.
