#!/usr/bin/env python3
import json
import argparse
from pathlib import Path

def iter_logs(path):
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line=line.strip()
            if not line: 
                continue
            try:
                yield json.loads(line)
            except Exception as e:
                print("bad json line:", e, line[:200])

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--file', default='messages.log')
    p.add_argument('--from-user', help='filter by sender')
    p.add_argument('--to-user', help='filter by recipient')
    p.add_argument('--tail', type=int, help='show last N entries (scans file)')
    args = p.parse_args()

    logs = list(iter_logs(args.file))

    if args.tail:
        logs = logs[-args.tail:]

    for entry in logs:
        if args.from_user and entry.get('from') != args.from_user:
            continue
        if args.to_user and entry.get('to') != args.to_user:
            continue
        print("----")
        print("time:", entry.get('timestamp'))
        print("from:", entry.get('from'), "to:", entry.get('to'), "type:", entry.get('type'))
        print("data:", json.dumps(entry.get('data'), indent=2)[:1000])  # first 1000 chars

if __name__ == '__main__':
    main()