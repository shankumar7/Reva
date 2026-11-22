# Free push notifications (Firebase)

Push is free forever on Firebase's free plan. You do this once. The notification only ever says something
plain like "Calculator: Tap to open". It never carries a name, a message or a picture.

## 1. Make a free Firebase project
1. Go to console.firebase.google.com and sign in with a Google account.
2. **Create a project** (any name, for example `utility-tools`). Turn Google Analytics **off**.

## 2. Add the Android app
1. In the project, click the Android icon (**Add app**).
2. **Android package name:** `com.utilkit.tools` (exactly this).
3. Click **Register app**, then **Download google-services.json**.
4. Keep that file in `app/` when you build the app (it is git-ignored, never commit it).
5. You can skip the other steps on that page.

## 3. Get the server key
1. In Firebase: the gear icon, **Project settings**, **Service accounts** tab.
2. Click **Generate new private key**, then confirm. A `.json` file downloads.
3. **Keep this one private.** Do not send it in chat. It goes only onto your server (next step).
4. In Oracle Cloud Shell, upload that file (Menu, Upload), then run (change KEYFILE and SERVER_IP):

```
scp -i ~/KEYFILE ~/NAME-OF-THE-DOWNLOADED-FILE.json ubuntu@SERVER_IP:~/fcm.json && ssh -t -i ~/KEYFILE ubuntu@SERVER_IP "sudo install -m 600 -o 1000 -g 1000 ~/fcm.json /opt/reva/secrets/fcm.json && rm ~/fcm.json && sudo docker restart reva"
```

5. The server log should say `push notifications: on`. Check with:
   `ssh -i ~/KEYFILE ubuntu@SERVER_IP "sudo docker logs reva | tail -3"`

## 4. Install the new app build
Build the app with your `google-services.json` in `app/` (see the README) and install the APK on both phones.
Open the chat once on each phone and allow notifications when Android asks.

## Notes
- Some phones (Xiaomi, Oppo, Vivo, Samsung) stop background apps to save battery. If notifications
  arrive late, open Android Settings, Apps, this app, Battery, and choose **No restrictions**.
- If the app is open, nothing pops up (you are already looking at the chat).
