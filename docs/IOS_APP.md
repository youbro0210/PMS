# SYU PMS — iOS(아이폰) 앱으로 쓰기

iOS는 안드로이드 APK처럼 "파일 하나 받아 바로 설치"가 안 됩니다(애플 정책). 두 가지 방법이 있고, **대부분은 방법 A로 충분**합니다.

---

## 방법 A — 홈 화면에 추가 (PWA · 무료 · Mac 불필요) ⭐ 권장

앱스토어 없이 아이폰에 **앱 아이콘 + 전체화면 앱**으로 설치됩니다. 별도 빌드/계정이 전혀 필요 없습니다.

1. 아이폰 **Safari**로 `https://pms-five-rosy.vercel.app` 접속(로그인).
2. 하단 **공유 버튼**(￪) 탭.
3. **"홈 화면에 추가"** 선택 → 이름(SYU PMS) 확인 → **추가**.
4. 홈 화면에 SYU·PMS 아이콘이 생깁니다. 탭하면 **주소창 없는 전체화면 앱**으로 실행됩니다.

> 이미 앱 아이콘(apple-touch-icon)·메타(apple-mobile-web-app-*)·매니페스트(`display: standalone`)를 넣어 두어, 배포된 상태면 위 절차만으로 앱처럼 동작합니다.
> ⚠️ 반드시 **Safari**로 하세요(크롬 등 다른 브라우저는 홈 화면 추가 시 전체화면이 안 될 수 있음).

---

## 방법 B — App Store 정식 앱 (Mac + Xcode + 개발자계정 필요)

사내 배포(MDM)나 스토어 등록이 꼭 필요할 때만 사용합니다.

준비물: **macOS + Xcode**, **Apple Developer Program($99/년)**.

1. https://www.pwabuilder.com 에서 URL 분석 → **Package For Stores → iOS** → 패키지 다운로드.
2. 받은 **Xcode 프로젝트**를 Mac의 Xcode로 엽니다(WKWebView 래퍼).
3. Signing에 본인 Apple Developer 팀 선택 → 실기기 연결 후 **Run**으로 설치 테스트.
4. 배포:
   - **TestFlight**(내부 테스트) 또는 **App Store** 심사 제출.
   - 사내에서만 쓰려면 Apple Business Manager + MDM 배포도 가능.

> iOS는 안드로이드처럼 서명된 파일을 임의 폰에 바로 설치할 수 없습니다. 실기기 설치조차 개발자계정 서명이 필요합니다. 그래서 "그냥 파일 하나 설치"는 iOS에서 불가능하고, **방법 A(홈 화면 추가)가 사실상 가장 빠른 iOS 앱**입니다.

---

## 참고

- 방법 A·B 모두 내용은 **배포된 웹**을 띄우므로, 웹을 업데이트(push→배포)하면 앱도 자동으로 최신입니다(재설치 불필요).
- 오프라인일 때는 마지막으로 본 화면만 표시됩니다(데이터 입력·조회는 온라인 필요).
- 안드로이드는 `docs/ANDROID_APK.md` 참고.
