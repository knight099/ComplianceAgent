#!/usr/bin/env python3
"""Collect local privileged group records, sign and export or upload."""
import argparse, base64, datetime, grp, hashlib, hmac, json, pathlib, pwd, urllib.request

def collect():
    facts = []
    for group in grp.getgrall():
        if group.gr_name in ('sudo', 'wheel'):
            names = set(group.gr_mem) | {u.pw_name for u in pwd.getpwall() if u.pw_gid == group.gr_gid}
            facts.append({'group': group.gr_name, 'members': sorted(names)})
    return facts

def main():
    p = argparse.ArgumentParser()
    p.add_argument('config')
    p.add_argument('output')
    args = p.parse_args()
    cfg = json.loads(pathlib.Path(args.config).read_text())
    payload = json.dumps(dict(source=cfg['device'], mode='Imported', status='Observed', collector='linux-local-groups/1', observed=datetime.datetime.now(datetime.timezone.utc).isoformat(), facts=collect())).encode()
    bundle = json.dumps(dict(device=cfg['device'], payload=base64.b64encode(payload).decode(), mac=hmac.new(bytes.fromhex(cfg['key']), payload, hashlib.sha256).hexdigest())).encode()
    pathlib.Path(args.output).write_bytes(bundle)
    if cfg.get('url'):
        if not cfg['url'].startswith('https://'): raise ValueError('HTTPS required')
        urllib.request.urlopen(urllib.request.Request(cfg['url'], bundle, {'Content-Type':'application/json'}), timeout=20).read()
if __name__ == '__main__': main()
