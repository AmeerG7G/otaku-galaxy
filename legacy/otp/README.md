# legacy/otp — SMS/OTP account flows (RETIRED 2026-09-12)

These files are the former SMS-OTP registration and password-recovery implementation.
They are **preserved, not compiled, not routed, not imported** — every file carries a
`.legacy` suffix so neither `tsc`, `vitest`, `flutter analyze` nor `build_runner` sees it.

Why they were retired: the store decided accounts are **admin-managed**. Registration and
logged-out password recovery create requests (`account_requests`) that an administrator
resolves from the dashboard after a manual WhatsApp check. The administrator-assigned
password is the customer's normal, permanent password — no temporary state.

| Preserved file | Was |
|---|---|
| `backend/services/otpService.ts.legacy` | code generation, send/verify, resend throttling |
| `backend/services/sms/index.ts.legacy` | `console` / `noop` / `http` SMS providers + boot check |
| `backend/repositories/verificationRepo.ts.legacy` | `verification_codes` table access |
| `backend/tests/fixtures/build-sms-provider.ts.legacy`, `sms-http-roundtrip.ts.legacy` | provider fixtures |
| `flutter/screens/otp_verification_screen.dart.legacy` | code-entry screen (both purposes) |
| `flutter/screens/reset_password_screen.dart.legacy` | new-password screen after a code |
| `flutter/widgets/otp_code_field.dart.legacy` | six-box code input |
| `flutter/usecases/*.dart.legacy` | `SendOtp` / `VerifyOtp` / `ResetPassword` usecases |

The `verification_codes` table still exists in the database schema (migration `001`); no
code reads or writes it. Dropping it is a separate data decision.

To resurrect any of this you would have to: restore the file without the suffix, re-add the
route/usecase/DI wiring, re-add the `SMS_*` / `DEV_OTP_*` config, and re-register the route in
`app_router.dart`. The tests in `backend/tests/auth.test.ts` («the old OTP endpoints are gone»)
and `test/admin_managed_account_flows_test.dart` («لا مسار رمز SMS») will fail until you do so
deliberately — that is intentional.
