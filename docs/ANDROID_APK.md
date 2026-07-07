# SYU PMS — 안드로이드 APK 만들기

이 앱은 서버 렌더링 웹앱(Next.js)입니다. 안드로이드 APK는 **배포된 웹을 감싸는 앱(TWA/PWA)** 방식으로 만듭니다. 아이콘·매니페스트·서비스워커는 이미 추가돼 있어, 배포만 되면 바로 패키징할 수 있습니다.

> 선행 조건: 최신 코드를 GitHub에 push → Vercel 배포 완료. 그 뒤 아래 진행.

## 방법 A — PWABuilder (가장 쉬움, 로컬 설치 불필요) ⭐

1. 브라우저에서 https://www.pwabuilder.com 접속
2. URL 입력: `https://pms-five-rosy.vercel.app` → **Start**
3. 매니페스트·서비스워커·아이콘 점검 결과가 나옵니다(대부분 통과).
4. **Package For Stores → Android** 선택 → **Generate Package**
5. 두 파일이 나옵니다:
   - `app-release-signed.apk` — **폰에 바로 설치용(테스트)**
   - `app-release-bundle.aab` — Google Play 스토어 업로드용
   - `signing.keystore` + 비밀번호 — **꼭 보관**(업데이트 시 동일 키 필요)
6. `.apk`를 안드로이드폰으로 옮겨 설치(설정에서 "알 수 없는 출처/이 소스 허용").

## 방법 B — Bubblewrap CLI (직접 빌드)

필요: Node.js, JDK 17, Android SDK.

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://pms-five-rosy.vercel.app/manifest.webmanifest
bubblewrap build      # → app-release-signed.apk 생성
```

## 주소창 완전히 없애기 (선택)

TWA는 기본적으로 상단 얇은 바가 잠깐 보일 수 있습니다. 완전한 전체화면(주소창 0)으로 하려면 **Digital Asset Links**를 등록합니다:

1. PWABuilder가 준 `assetlinks.json`을 받습니다(패키지의 SHA-256 지문 포함).
2. 이 파일을 `public/.well-known/assetlinks.json`에 넣고 배포합니다.
   → `https://pms-five-rosy.vercel.app/.well-known/assetlinks.json` 로 열려야 함.

이러면 폰이 "이 앱은 이 사이트의 공식 앱"으로 인정해 주소창이 사라집니다.

## 참고

- APK 내용은 실제로는 배포된 웹을 띄우므로, 웹을 업데이트(push→배포)하면 **앱도 자동으로 최신** 화면이 됩니다(앱 재빌드 불필요).
- 오프라인일 때는 마지막으로 본 화면(서비스워커 캐시)만 표시됩니다. 데이터 입력·조회는 온라인이 필요합니다.
