import csv
import re
import time
import urllib.parse
import urllib.request


def num(x):
    try:
        return float(str(x).replace('%', '').strip())
    except Exception:
        return None


def boo(x):
    if x is None:
        return None
    s = str(x).strip().lower()
    if s == 'true':
        return True
    if s == 'false':
        return False
    return None


def map_sym(tv_ticker):
    base = tv_ticker.split(',')[0].strip()
    if ':' not in base:
        return None
    exch, sym = base.split(':', 1)
    exch = exch.upper()
    sym = sym.upper()
    if exch.startswith('NSE'):
        return sym.lower() + '.in'
    if exch.startswith('BATS') or exch.startswith('NYSE') or exch.startswith('NASDAQ'):
        return sym.lower() + '.us'
    if exch.startswith('HKEX'):
        return sym.lower() + '.hk'
    if exch.startswith('SGX'):
        return sym.lower() + '.sg'
    if exch.startswith('ASX'):
        return sym.lower() + '.au'
    return None


def fetch_stooq(sym, cache):
    if sym in cache:
        return cache[sym]
    try:
        url = 'https://stooq.com/q/l/?s=' + urllib.parse.quote(sym) + '&i=1'
        txt = urllib.request.urlopen(url, timeout=10).read().decode('utf-8', 'ignore').strip()
        parts = txt.split(',')
        if len(parts) >= 7 and parts[6].strip() and parts[6].strip().lower() != 'n/d':
            cache[sym] = float(parts[6].strip())
            return cache[sym]
    except Exception:
        pass
    cache[sym] = None
    return None


def pct(arr, predicate):
    if not arr:
        return 0.0
    return sum(1 for x in arr if predicate(x)) * 100.0 / len(arr)


def avg_ret(arr):
    if not arr:
        return 0.0
    return sum(x['ret'] for x in arr) / len(arr)


def add_pattern(patterns, name, arr, min_support=3):
    if len(arr) < min_support:
        return
    success = pct(arr, lambda x: x['ret'] > 0)
    profit = pct(arr, lambda x: x['ret'] >= 5)
    average = avg_ret(arr)
    patterns.append((name, len(arr), success, profit, average))


def main():
    path = r'Temp/TradingView_Alerts_Log_2026-03-25.csv'
    alerts = []

    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            desc = row.get('Description', '')
            kv = {k.strip(): v.strip() for k, v in re.findall(r'([A-Za-z_+\-%]+):\s*([^,]+)', desc)}
            m = re.search(r'price:\s*([0-9]+(?:\.[0-9]+)?)', desc)
            alerts.append({
                'ticker': row.get('Ticker', ''),
                'price': num(m.group(1)) if m else None,
                'LongTrade': boo(kv.get('LongTrade')),
                'sqzOff': boo(kv.get('sqzOff')),
                'ma_up': boo(kv.get('ma_up')),
                'rsi': num(kv.get('rsi')),
                'adx': num(kv.get('ADX')),
                'pchange': num(kv.get('prev_change_percent')),
                'time': row.get('Time', ''),
            })

    cache = {}
    symbols = sorted(set(map_sym(a['ticker']) for a in alerts if map_sym(a['ticker'])))
    for sym in symbols:
        fetch_stooq(sym, cache)
        time.sleep(0.01)

    rows = []
    for a in alerts:
        sym = map_sym(a['ticker'])
        cp = fetch_stooq(sym, cache) if sym else None
        if cp is None or a['price'] in (None, 0):
            continue
        ret = (cp - a['price']) / a['price'] * 100.0
        b = dict(a)
        b['ret'] = ret
        rows.append(b)

    print(f'TOTAL_ALERTS={len(alerts)}')
    print(f'ENRICHED_WITH_CURRENT_PRICE={len(rows)}')
    if not rows:
        print('NO_MATCHED_CURRENT_PRICES')
        return

    base_success = pct(rows, lambda x: x['ret'] > 0)
    base_profit = pct(rows, lambda x: x['ret'] >= 5)
    print(f'BASE_SUCCESS_RET_GT_0={base_success:.2f}%')
    print(f'BASE_PROFIT_RET_GE_5={base_profit:.2f}%')

    patterns = []
    add_pattern(patterns, 'LongTrade=true', [x for x in rows if x['LongTrade'] is True])
    add_pattern(patterns, 'sqzOff=true', [x for x in rows if x['sqzOff'] is True])
    add_pattern(patterns, 'ma_up=true', [x for x in rows if x['ma_up'] is True])
    add_pattern(patterns, 'rsi>=70', [x for x in rows if x['rsi'] is not None and x['rsi'] >= 70])
    add_pattern(patterns, '60<=rsi<70', [x for x in rows if x['rsi'] is not None and 60 <= x['rsi'] < 70])
    add_pattern(patterns, 'adx<15', [x for x in rows if x['adx'] is not None and x['adx'] < 15])
    add_pattern(patterns, '15<=adx<25', [x for x in rows if x['adx'] is not None and 15 <= x['adx'] < 25])
    add_pattern(patterns, '0<=pchange<0.5', [x for x in rows if x['pchange'] is not None and 0 <= x['pchange'] < 0.5])

    def hour_9_12(x):
        t = x['time']
        return len(t) >= 13 and t[11:13].isdigit() and 9 <= int(t[11:13]) < 12

    add_pattern(patterns, 'hour_9_12', [x for x in rows if hour_9_12(x)])
    add_pattern(patterns, 'LongTrade=true & adx<15', [x for x in rows if x['LongTrade'] is True and x['adx'] is not None and x['adx'] < 15])
    add_pattern(patterns, 'LongTrade=true & 0<=pchange<0.5', [x for x in rows if x['LongTrade'] is True and x['pchange'] is not None and 0 <= x['pchange'] < 0.5])
    add_pattern(patterns, '0<=pchange<0.5 & hour_9_12', [x for x in rows if x['pchange'] is not None and 0 <= x['pchange'] < 0.5 and hour_9_12(x)])
    add_pattern(patterns, 'LongTrade=true & 0<=pchange<0.5 & hour_9_12', [x for x in rows if x['LongTrade'] is True and x['pchange'] is not None and 0 <= x['pchange'] < 0.5 and hour_9_12(x)])

    patterns.sort(key=lambda z: (max(z[2], z[3]), z[1], z[4]), reverse=True)

    print('TOP_PATTERNS_CURRENT_PRICE')
    for name, n, s, p, a in patterns[:20]:
        print(f'{name} | n={n} | success={s:.1f}% | profit_ge5={p:.1f}% | avg_ret={a:.2f}%')


if __name__ == '__main__':
    main()
