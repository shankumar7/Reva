# Setting up your server (Oracle Cloud)

You do this once. It takes about 20 minutes. Nothing here needs coding.

## 0. Keep the server from being taken away (important)

Oracle can reclaim Always Free servers that sit nearly idle for 7 days. To prevent that:

1. In Oracle Cloud, open **Billing, Upgrade and Manage Payment** and **upgrade to Pay As You Go**.
   You stay inside the free limits, so you are not charged for the free-tier server.
2. Open **Billing, Budgets** and create a budget of **$1** with an email alert.
3. Never treat the server as the only copy of anything. Download a backup now and then (see the end).

## 1. Give the server a name

1. Go to duckdns.org, sign in, and create a name, for example `my-quiet-name`.
2. Put your server's **public IP address** in the "current ip" box and press **update ip**.
   Your address will be `my-quiet-name.duckdns.org`.

## 2. Open the web doors in Oracle Cloud

1. Instances, then your server, then its **Subnet**, then its **Security List**.
2. **Add Ingress Rules**, twice:
   - Source CIDR `0.0.0.0/0`, protocol TCP, destination port **80**
   - Source CIDR `0.0.0.0/0`, protocol TCP, destination port **443**

## 3. Install, with one command

1. Open **Oracle Cloud Shell** (the terminal icon at the top right of the Oracle page).
2. Use the menu (the three lines at the top left of Cloud Shell) and choose **Upload**.
   Upload two files: `reva-server.tar.gz` (I sent it in the chat) and your server's SSH key file.
3. Paste this, after changing the three words in capitals:

```
chmod 600 ~/KEYFILE && scp -o StrictHostKeyChecking=accept-new -i ~/KEYFILE reva-server.tar.gz ubuntu@SERVER_IP:~ && ssh -t -i ~/KEYFILE ubuntu@SERVER_IP "tar xzf reva-server.tar.gz && sudo bash reva-server/deploy/install.sh NAME.duckdns.org"
```

   - `KEYFILE`: the name of the SSH key file you uploaded
   - `SERVER_IP`: your server's public IP address
   - `NAME.duckdns.org`: your DuckDNS address

4. Wait. At the end it prints **DONE** and a square QR code on the screen.

## 4. Connect the phones

1. Install `app-v0.1.0.apk` on both phones. Android will ask you to allow installing from your file app.
2. Phone 1: open the app, choose **I am starting**, and scan the QR code from the Cloud Shell screen.
3. Phone 1 now shows a QR code. On phone 2 choose **My partner already started** and scan it.
4. Phone 2 shows a QR code back. On phone 1 press **They scanned it** and scan it.
5. Both phones choose their secret codes. Done. After this, no third phone can ever join.

## If a phone is wiped or lost and you have no backup

The server remembers exactly two phones. A phone with no backup has lost its key, so the server will refuse it.
Run `sudo bash reva-server/deploy/reset-pairing.sh` on the server (same `ssh` pattern as above). It forgets both
phones. Then pair again with the QR codes. Messages already on a phone stay there. With a **backup**
(Settings, Backup) none of this is needed: restore it and the phone is the same phone again.

## Updating the app later

1. I send you a new APK. Upload it to Cloud Shell.
2. Run (changing the numbers): 
   `scp -i ~/KEYFILE app.apk ubuntu@SERVER_IP:~ && ssh -t -i ~/KEYFILE ubuntu@SERVER_IP "sudo bash reva-server/deploy/publish-update.sh app.apk 2 0.2.0 'What is new'"`
3. On each phone: Settings, then **Check for updates**.

## Backups

The server makes an encrypted backup every day and keeps the last 7, in `/opt/reva/data/backups`.
The key to open them is `BACKUP_KEY` inside `/opt/reva/.env` on the server. Save that key somewhere safe,
away from the server. Messages and pictures are already encrypted end to end, so the backup holds only
scrambled data, the two device keys and any messages not yet delivered.

## Running other apps on the same server later

Reva lives in its own container with its own database and secrets. The web front door (`/opt/edge`) is shared:
another app adds a small file in `/opt/edge/sites/` for its own name. Nothing else is shared.
