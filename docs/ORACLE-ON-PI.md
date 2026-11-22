# Getting the Oracle server using a Raspberry Pi (runs all night, no Enter presses)

Oracle's free Arm servers are often "out of capacity". The script `tools/oracle-get-server.sh` keeps asking politely
(every 5 minutes) until Oracle has room. Cloud Shell closes after 20 idle minutes, so run it on a Pi instead.
You need a Pi that stays on and online (64-bit Raspberry Pi OS or Ubuntu).

1. **Install the Oracle tool** (on the Pi):
   ```bash
   sudo apt update && sudo apt install -y python3-venv python3-pip git
   python3 -m venv ~/ocienv && ~/ocienv/bin/pip install oci-cli
   echo 'export PATH=$HOME/ocienv/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
   oci --version
   ```
2. **Log the Pi in to your Oracle account** (once):
   ```bash
   oci setup config
   ```
   It asks for your user OCID and tenancy OCID (Oracle console: top-right profile icon, "My profile" / "Tenancy"),
   your region (the same one you chose when you signed up, for example `ap-hyderabad-1`) and offers to make a key.
   Say yes. At the end it prints a **public key**. In the console open *Profile > My profile > API keys > Add API key >
   Paste a public key* and paste it. Test with: `oci iam region list` (it should print regions, not an error).
3. **Get the script and start it:**
   ```bash
   git clone <your private repo address> reva   # or copy tools/oracle-get-server.sh onto the Pi
   cd reva/tools
   nohup bash oracle-get-server.sh > ~/reva-oracle.log 2>&1 &
   ```
   Close the terminal if you like. Look at progress any time: `tail -n 20 ~/reva-oracle.log`
4. When the log says **YOUR SERVER IS READY** it shows the public IP. Note the public IP: it is your server address.
   Stop the script early with `pkill -f oracle-get-server`. It never makes two servers.

Notes: keep the Pi's power and internet on. The private SSH key is saved at `~/reva_key` on the Pi: keep it,
you need it to log in to the server later. Never put it in the repo.
