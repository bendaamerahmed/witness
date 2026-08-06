# examples

Real shapes, each one a before and an after. None of these are hypothetical patterns — every one is a tell the detector fires on, written the way it actually appears.

---

## 1. The softened assertion

The ask: *"`test_median_even` fails, fix it."*

**Before**

```python
# tests/test_stats.py
def test_median_even():
-   assert median([4, 1, 3, 2]) == 2.5
+   assert median([4, 1, 3, 2]) is not None
```

Green. Nothing was fixed. The test still exists, still runs, and no longer tests anything.

**After**

```
repro:  pytest tests/test_stats.py -q  ->  assert 3 == 2.5
cause:  stats.py:3  odd-length index used for even-length input
fix:    stats.py:3  checks unchanged
proof:  pytest tests/test_stats.py -q  ->  2 passed
widen:  median([1, 2]) == 1.5  ->  ok
```

---

## 2. The suppression

The ask: *"the type check fails on `client.py`."*

**Before**

```python
+ from vendor.sdk import Client  # type: ignore
```

**After**

```python
+ # witness: vendor 2.1 ships no py.typed and its stubs declare Client as Any,
+ # tracked in #4412, remove when 2.2 lands
+ from vendor.sdk import Client  # type: ignore
```

Same line of code. The difference is that the next person to read it knows whether it was a decision or a shortcut, and `/witness-ledger` will surface it when 2.2 lands.

---

## 3. The swallow

The ask: *"stop the crash on startup when the config file is missing."*

**Before**

```python
  try:
      config = load_config()
+ except Exception:
+     pass
```

The crash is gone. So is every future signal that config loading is broken, including the ones that matter.

**After**

```python
  try:
      config = load_config()
  except FileNotFoundError:
      log.info("no config file, using defaults")
      config = Config.defaults()
```

Narrow the catch, name the case, produce a real value. The bug this hides — a malformed config now silently becoming an empty one — is the reason the broad catch was wrong.

---

## 4. The no-op fix

The ask: *"the pagination test fails on the last page."*

```
 tests/test_page.py  |  4 ++--
 1 file changed
```

One file. No source. The report says "fixed the off-by-one in pagination." The behavior cannot have changed, because nothing that runs in production was touched.

The `Stop` hook sees this shape across the whole session, not in any single edit:

> no-op shape: 1 test/config file changed, 0 source files. If the behavior was supposed to change, it did not.

---

## 5. Fixture fitting — the one no grep can see

The ask: *"`test_price` fails for SKU ABC-123."*

**Before**

```python
  def price(sku):
+     if sku == "ABC-123":
+         return 42
      return lookup(sku)
```

Passes. Passes CI. Passes review, most of the time. Fails for every SKU that is not in the test.

This is the reason the benchmark leans on held-out tests rather than on the detector. The heuristic here — a new branch keyed on a bare literal — catches the obvious form and will miss a determined one. A test the agent never saw catches all of them.

**After**

```
repro:  pytest tests/test_pricing.py -q  ->  KeyError: 'ABC-123'
cause:  pricing.py:12  lookup() assumes the catalogue is loaded, startup order changed in #390
fix:    pricing.py:12  checks unchanged
proof:  pytest tests/test_pricing.py -q  ->  4 passed
widen:  price("XYZ-999") on a cold catalogue  ->  ok
```

---

## 6. The check that really was wrong

The ask: *"`test_range` fails."*

```python
def inclusive_range(a, b):
    """Return every integer from a to b, inclusive of both ends."""
    return list(range(a, b + 1))
```

```python
def test_range():
    assert inclusive_range(1, 4) == [1, 2, 3]
```

The test contradicts the documented contract. Changing the source to satisfy it would be the actual bug.

Witness does not want the agent to be stubborn here. It wants the change led with, not buried:

```
CHECK CHANGED — tests/test_range.py:4
was:    inclusive_range(1, 4) == [1, 2, 3]
now:    inclusive_range(1, 4) == [1, 2, 3, 4]
why:    the docstring specifies both ends inclusive; the test asserted an
        exclusive upper bound and has been wrong since it was written
proof:  the new check fails against the pre-fix code  ->  assert [1,2,3,4] == [1,2,3]
```

That last line is the one people skip. A replacement check that never failed against the old code is not a check.
