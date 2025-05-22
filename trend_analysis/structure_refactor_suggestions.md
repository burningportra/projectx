# Structural & Organizational Refactor Suggestions for `trend_analyzer_alt.py`

## 1. Modularize by Subject Area

**Proposed directory structure:**

```
trend_analysis/
  models/
    bar.py         # Bar class
    state.py       # State class
  patterns/
    basic.py       # Basic bar patterns (OHLC comparisons)
    uptrend.py     # Uptrend patterns and rules
    downtrend.py   # Downtrend patterns and rules
  rules/
    pus_rules.py   # Pending Uptrend Start rules
    pds_rules.py   # Pending Downtrend Start rules
    cus_rules.py   # Confirmed Uptrend Start rules
    cds_rules.py   # Confirmed Downtrend Start rules
  utils/
    io.py          # File loading/saving utilities
    logging.py     # Logging utilities
  analyzer.py      # Main analyzer class
  main.py          # Entry point
```

## 2. Analyzer Class

Encapsulate the main logic in a `TrendAnalyzer` class:

```python
class TrendAnalyzer:
    def __init__(self):
        self.state = State()
    def analyze(self, bars):
        # Main analysis logic
    def _process_bar(self, current_bar, prev_bar):
        # Process a single bar
```

## 3. Rule Strategy Pattern

Abstract rules as classes for extensibility:

```python
class TrendRule(ABC):
    @abstractmethod
    def evaluate(self, current_bar, prev_bar, state):
        pass
class LowerOHLCRule(TrendRule):
    def evaluate(self, current_bar, prev_bar, state):
        return is_lower_ohlc_bar(current_bar, prev_bar)
```

## 4. Configurable Rule Sets

Move rule definitions to config or registry:

```python
CUS_RULES = [
    {"name": "LOWER_OHLC", "class": LowerOHLCRule},
    {"name": "LowUndercutHighRespect", "class": LowUndercutHighRespectRule},
    # ...
]
```

## 5. Dependency Injection

Allow passing state and rules for easier testing:

```python
def process_trend_logic(all_bars, state=None, rules_provider=None):
    state = state or State()
    rules_provider = rules_provider or DefaultRulesProvider()
```

## 6. State Class Decomposition

Break up the monolithic State class:

```python
class UpTrendState:
    def __init__(self):
        self.pending_start_bar_index = None
        self.pending_start_anchor_low = None
class DownTrendState:
    # ...
```

## 7. Type Annotations

Add type hints everywhere for clarity and tooling:

```python
def process_trend_logic(all_bars: List[Bar]) -> List[str]:
```

## 8. Naming Consistency

Stick to snake_case for all functions and methods.

## 9. Error Handling

Add robust exception handling and input validation.

---

**Summary:**
- Split by subject area (models, rules, patterns, utils)
- Use classes for analyzer and rules
- Make rules configurable and testable
- Decompose state
- Use type hints and consistent naming
- Improve error handling

This will make the codebase more maintainable, testable, and extensible for future trend logic and research. 