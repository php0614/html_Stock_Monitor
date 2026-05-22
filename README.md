# 주식 모니터 (Stock Monitor)

KOSPI 16개 + NASDAQ 16개 종목의 실시간 시세를 한 화면에서 모니터링하는 단일 HTML 페이지입니다. 모든 설정은 Supabase Storage 에 CSV 파일(`stock_pl_settings.csv`)로 저장되어 어느 기기에서 접속해도 같은 설정이 적용됩니다.

---

## 1. 주요 기능

- **반응형 그리드**: 화면 폭에 따라 자동으로 1~8열로 재배치됩니다. (PC 1400px 이상 → 8×4, 모바일 → 2열)
- **실시간 시세**:
  - NASDAQ → Finnhub WebSocket (`wss://ws.finnhub.io`) — 거래가 발생할 때마다 push
  - KOSPI → 한국투자증권(KIS) REST 1초 폴링 (병렬 처리, `Promise.allSettled`)
- **PER / ROE** 표시 (KIS: EPS/BPS 로 ROE 근사, Finnhub: `peTTM`, `roeTTM`)
- **오늘 차트**: 페이지를 연 시점부터 누적된 ticks 를 캔버스에 그립니다. 새 데이터가 들어올 때 왼쪽 끝이 밀려나며 타임라인이 흘러갑니다.
- **장마감 시**: 그래프를 숨기고 가장 최근 종가를 현재가 자리에 표시 + “장마감” 태그.
- **과거 종가 표시** (각 카드 4개, 디테일 화면 8개): 1·2·3·4·5일 전, 1·2주, 1·3·6개월, 1년 등에서 드롭다운으로 선택.
- **우클릭 / 길게 누르기** → 종목 설정 모달 (종목 변경, 표시명, 과거 종가 옵션).
- **더블클릭 / 모바일 스와이프-업** → 풀스크린 상세 화면 (3일치 그래프 + 과거 종가 8개).
- **전역 설정** (헤더 ⚙ 아이콘): KOSPI 데이터 소스 선택, KIS Key/Secret, Finnhub Key, 폴링 주기, 프록시 URL.

---

## 2. Supabase 셋업

1. 대시보드에서 anon key 확인:
   `Project Settings → API → Project API Keys → anon public`
   (이미 코드에 하드코딩되어 있음)
2. Storage 버킷 생성:
   `Storage → New Bucket` → 이름: `stock-monitor`
   (다른 이름을 쓰려면 `index.html` 상단의 `const BUCKET` 을 수정)
3. Storage Policies 추가 (anon read + write):
   `Storage → Policies → New Policy (For full customization)` 두 개 생성
   - **anon read**: SELECT, role `anon`, USING `true`
   - **anon write**: INSERT + UPDATE, role `anon`, USING `true`, WITH CHECK `true`
4. 페이지 첫 진입 시 파일이 없으면 기본 설정으로 시작합니다. ⚙ 에서 키를 입력하고 저장하면 `stock_pl_settings.csv` 가 생성됩니다.

---

## 3. API 키 발급

### Finnhub (NASDAQ)
- https://finnhub.io 무료 가입 → Dashboard 에 API Key 표시
- WebSocket 은 무료 플랜에서 무제한 거래 이벤트 수신 가능
- `/stock/metric` (PER/ROE) 도 무료 플랜에서 사용 가능
- `/stock/candle` 는 유료. 본 앱은 미국 일봉을 **Stooq** (`stooq.com/q/d/l/`) 무료 CSV 에서 보조 조회합니다.

### 한국투자증권 (KIS)
- https://apiportal.koreainvestment.com/ 가입 → 앱 등록 → `App Key`, `App Secret` 발급
- 실전투자 base: `https://openapi.koreainvestment.com:9443`
- 모의투자 base: `https://openapivts.koreainvestment.com:29443`
- 본 앱이 사용하는 엔드포인트:
  - `POST /oauth2/tokenP` — 접근토큰 발급 (24시간 캐싱)
  - `GET /uapi/domestic-stock/v1/quotations/inquiry-price` (`tr_id: FHKST01010100`) — 현재가, PER, EPS, BPS
  - `GET /uapi/domestic-stock/v1/quotations/inquiry-daily-price` (`tr_id: FHKST01010400`) — 일자별 종가
- **CORS 주의**: KIS 서버는 `Access-Control-Allow-Origin` 헤더를 응답에 포함하지 않기 때문에 브라우저가 직접 요청을 차단합니다.  
  → **로컬 CORS 프록시를 사용하세요** (아래 9절 참고). 본 앱은 `proxyUrl + '/' + 원본URL` 형태로 요청을 프록시에 전달합니다.

---

## 4. 데이터 파일 포맷 (`stock_pl_settings.csv`)

RFC-4180 형식의 단순 키-값 CSV. `value` 셀에 JSON 전체가 들어 있습니다:

```csv
key,value
config,"{""version"":1,""global"":{""kospiSource"":""kis"",""kisKey"":""…"",""kisSecret"":""…"",""kisEnv"":""real"",""finnhubKey"":""…"",""refreshSec"":1,""proxyUrl"":""""},""stocks"":{""kr"":[{""ticker"":""005930"",""name"":""삼성전자"",""past"":[""1d"",""2d"",""3d"",""1w""]}, …],""us"":[…]},""detailPast"":[""1d"",""2d"",""3d"",""5d"",""1w"",""2w"",""1m"",""3m""]}"
```

JSON 스키마:

```jsonc
{
  "version": 1,
  "global": {
    "kospiSource": "kis" | "krx",
    "kisKey": "string",
    "kisSecret": "string",
    "kisEnv": "real" | "vts",
    "finnhubKey": "string",
    "refreshSec": 1,                 // KIS REST 폴링 주기(초)
    "proxyUrl": ""                   // CORS 우회용
  },
  "stocks": {
    "kr": [ { "ticker":"005930", "name":"삼성전자", "past":["1d","2d","3d","1w"] }, ... ],
    "us": [ { "ticker":"AAPL",   "name":"Apple",    "past":["1d","2d","3d","1w"] }, ... ]
  },
  "detailPast": ["1d","2d","3d","5d","1w","2w","1m","3m"]  // 상세 화면 8개 과거 종가
}
```

`past` 항목에 사용 가능한 키: `1d, 2d, 3d, 4d, 5d, 1w, 2w, 1m, 3m, 6m, 1y`.

---

## 5. 사용법

1. `index.html` 을 브라우저로 직접 열거나 정적 호스팅 (GitHub Pages, Netlify, Vercel) 에 업로드.
2. 우상단 ⚙ 클릭 → Finnhub API Key, KIS App Key/Secret 입력 → 저장.
3. NASDAQ 시세는 WebSocket 으로 자동 연결되어 즉시 갱신됩니다.
4. KOSPI 시세는 매 1초 (조정 가능, 1~10) 병렬 폴링됩니다.
5. 각 카드를:
   - 우클릭 (PC) / 길게 누르기 (모바일) → 종목 변경, 과거 종가 옵션 변경
   - 더블클릭 (PC) / 위로 스와이프 (모바일) → 풀스크린 상세 화면
6. Esc 키로 모달/상세화면을 닫습니다.

### GitHub Pages + Cloudflare Worker 배포 (온라인, 무료)

GitHub Pages 는 정적 파일만 호스팅하므로 Node.js 프록시를 실행할 수 없습니다.
대신 **Cloudflare Worker** 를 CORS 프록시로 배포합니다 (무료 100k req/day).

#### Step 1 — Cloudflare Worker 배포

1. [cloudflare.com](https://cloudflare.com) 무료 가입
2. 터미널에서 Wrangler CLI 설치 및 로그인:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
3. 이 폴더에서 Worker 배포:
   ```bash
   wrangler deploy
   ```
4. 배포 완료 후 출력되는 URL 저장 (예: `https://stock-monitor-proxy.YOUR-ID.workers.dev`)

#### Step 2 — GitHub Pages 배포

```bash
git init
git add index.html README.md worker.js wrangler.toml
git commit -m "Init stock monitor"
git remote add origin https://github.com/YOUR-USERNAME/stock-monitor.git
git push -u origin main
```
GitHub repo → **Settings → Pages → Source: main / root** → Save.
잠시 후 `https://YOUR-USERNAME.github.io/stock-monitor/` 로 접속 가능.

#### Step 3 — 앱에서 프록시 URL 설정

GitHub Pages 에서 앱을 열고 ⚙ → **프록시 URL** 에 Step 1의 Worker URL 입력:
```
https://stock-monitor-proxy.YOUR-ID.workers.dev
```
저장 → Supabase 에 영구 저장되어 이후 재설정 불필요.

### Netlify Drop (대안)
[netlify.com/drop](https://app.netlify.com/drop) 에 폴더를 끌어다 놓으면 즉시 배포됩니다.
Cloudflare Worker 프록시 URL 은 동일하게 사용합니다.

---

## 6. 제약 사항 / 알려진 한계

- **오늘 차트는 페이지를 연 이후의 ticks 만** 표시합니다 (Finnhub free 의 분봉 미제공, 또한 KIS 분봉은 별도 호출 필요). 새로고침하면 그래프가 초기화됩니다. 분봉 백필을 원하면 `kisDailyHistory` 옆에 분봉 엔드포인트 호출을 추가하세요 (`/uapi/domestic-stock/v1/quotations/inquiry-time-itemchartprice`).
- **장 운영 시간**:
  - KOSPI: KST 평일 09:00–15:30
  - NASDAQ: ET 평일 09:30–16:00 (서머타임 자동 반영, `Intl.DateTimeFormat` 사용)
  - 한국 공휴일, 미국 공휴일은 별도 보정하지 않습니다 (장이 닫혀 있어도 그래프는 그려질 수 있음 — 실제 ticks 가 없으므로 변화 없음).
- **ROE (KOSPI)**: KIS 의 현재가 조회 응답에는 ROE 가 없어 `EPS/BPS × 100` 으로 근사합니다. 정확한 ROE 가 필요하면 `재무비율` API 를 별도 호출하세요.
- **Finnhub free 의 `/stock/candle`** 은 paid 전용으로 변경되어, 미국 일봉은 Stooq 의 일봉 CSV 를 사용합니다. Stooq 가 CORS 를 막을 경우 ⚙ 의 프록시 URL 을 사용하세요.
- **KRX 옵션**: 깔끔한 무료 실시간 JSON API 가 없어 본 앱에서는 빈 구현입니다. KOSPI 데이터 소스 드롭다운에 자리만 마련해 두었습니다.
- **API 키 저장 위치**: anon key 로 접근 가능한 Supabase Storage 에 평문 저장됩니다. 본 앱은 개인용을 가정합니다. 공유 환경에서는 anon 권한을 더 제한하거나 별도 인증을 붙이세요.

---

## 7. 코드 구조 요약

`index.html` 단일 파일:
- 상단 `<style>`: 카드 그리드 + 모달 + 상세화면 (Helvetica Neue · Noto Sans KR · JetBrains Mono 폰트 스택, 한국식 색상: 상승 빨강 / 하락 파랑)
- 상단 `<script>`:
  - `loadSettings / saveSettings` — Supabase CSV ↔ JSON
  - `kisGetToken / kisQuote / kisDailyHistory` — KIS REST
  - `finnhubQuote / finnhubMetrics / finnhubWsConnect` — Finnhub
  - `stooqDailyHistory` — 미국 일봉 보조
  - `pollOne / pollOnce / startPolling` — 1초 병렬 폴링
  - `refreshHistoricalAll` — 한 시간마다 일봉/펀더멘털 갱신
  - `drawLineGraph` — Canvas 그래프 (rolling window)
  - `openGridSettings / openDetail` — 모달과 상세화면 핸들러
  - `attachCardEvents` — 우클릭 · 더블클릭 · 길게누르기 · 스와이프 업

---

## 8. 로컬 CORS 프록시 사용법

KIS(한국투자증권) API 는 브라우저 직접 호출 시 CORS 오류가 발생합니다.  
`proxy.js` 를 로컬에서 실행하여 모든 API 요청을 중계하세요.

### 요구사항
- Node.js 설치 (npm 필요 없음 — 내장 모듈만 사용)

### 실행 방법

**방법 A — 배치 파일 더블클릭 (Windows)**
```
start-proxy.bat
```

**방법 B — 터미널**
```
node proxy.js        # 기본 포트 8081
node proxy.js 9090   # 포트 지정
```

### 앱 설정

1. 프록시를 실행한 뒤 브라우저에서 `index.html` 을 엽니다.
2. 헤더의 ⚙ (전역 설정) 클릭.
3. **프록시 URL** 항목에 입력:
   ```
   http://127.0.0.1:8081
   ```
4. **저장** → KOSPI 시세가 정상 표시됩니다.

> 프록시는 `http://127.0.0.1:8081/<전체 대상 URL>` 형식으로 요청을 받아 대상 서버에 전달하고,  
> 응답에 `Access-Control-Allow-Origin: *` 헤더를 추가해 브라우저로 반환합니다.

---

## 9. 라이선스
사적 사용 전용. 외부 API 의 사용 약관 (Finnhub, 한국투자증권, Stooq) 을 준수하세요.
