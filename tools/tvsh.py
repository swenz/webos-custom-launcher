"""Dev helper: run a shell command on a rooted webOS TV via the Homebrew Channel root telnet.
Usage: python tools/tvsh.py HOST 'cmd' [timeout]"""
import socket, sys, time, re

host, cmd = sys.argv[1], sys.argv[2]
timeout = float(sys.argv[3]) if len(sys.argv) > 3 else 30
END = "__END_%d__" % int(time.time())

s = socket.create_connection((host, 23), timeout=8)
s.settimeout(1.0)


def read_some():
    try:
        data = s.recv(65536)
    except socket.timeout:
        return b""
    out = bytearray()
    i = 0
    while i < len(data):
        b = data[i]
        if b == 255 and i + 1 < len(data):  # IAC
            op = data[i + 1]
            opt = data[i + 2:i + 3]
            if op in (251, 252):  # WILL/WONT -> DONT
                s.sendall(bytes([255, 254]) + opt)
            elif op in (253, 254):  # DO/DONT -> WONT
                s.sendall(bytes([255, 252]) + opt)
            i += 3
            continue
        out.append(b)
        i += 1
    return bytes(out)


t0 = time.time()
banner = b""
while time.time() - t0 < 3:
    banner += read_some()
    if banner.rstrip().endswith((b"#", b"$")):
        break
if b"ogin:" in banner:
    s.sendall(b"root\n")
    time.sleep(1.5)
    banner += read_some()

START = END.replace("END", "START")
s.sendall(("echo " + START[:5] + "''" + START[5:] + "; " + cmd + "; echo " + END[:5] + "''" + END[5:] + " $?\n").encode())
buf = b""
t0 = time.time()
while time.time() - t0 < timeout:
    buf += read_some()
    if END.encode() in buf:
        break
text = buf.decode("utf-8", "replace").replace("\r", "")
m = re.search(re.escape(END) + r" (\d+)", text)
body = text.split(END)[0].split(START + "\n")[-1]
# drop echoed command line if present
lines = body.split("\n")
lines = [l for l in lines if END[:5] + "''" not in l]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print("\n".join(lines).strip())
if not m:
    print("[tvsh: timeout/no end marker]\n--- banner ---\n" + banner.decode("utf-8", "replace"))
    sys.exit(124)
sys.exit(int(m.group(1)))
