# Security policy

Reva is a personal, early-stage project and has **not been independently audited**.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting: open the repository's **Security** tab and choose **Report a vulnerability**
(private vulnerability reporting). Include what you found, how to reproduce it, and which version you tested.
You will get a reply as soon as the maintainer can; this is a spare-time project, so please be patient.

## What counts

Things that would let someone read messages, impersonate a phone, join a space they were not paired into, bypass the
lock or the passcode limit, learn a secret from the server or the logs, or turn the call relay into an open proxy.

## What does not

A phone that is already unlocked, rooted or infected; someone who knows your codes; your own server being
misconfigured or shared with others; the disguise being recognised by someone who knows the app exists.

## If you run your own copy

- Keep your **signing key**, **setup code**, server `.env`, `google-services.json` and Firebase service-account file out of
  Git and out of screenshots.
- A setup code only works until both phones are paired. Pairing QR codes should be sent to your partner only, then deleted.
- Keep the server updated (`docs/SERVER-SETUP.md`) and the Oracle network rules as narrow as the guide says.
