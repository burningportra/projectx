# --- Helper Functions for Bar Patterns ---
def is_lower_ohlc_bar(current_bar, prev_bar):
  """Checks if current_bar has lower Open, High, Low, Close (OHLC) compared to prev_bar.
     Lower low, lower high, lower close than prev_bar. (Open is not explicitly checked here but implied by "lower prices")
  """
  res_l = current_bar.l < prev_bar.l
  res_h = current_bar.h < prev_bar.h
  res_c = current_bar.c < prev_bar.c
  return res_l and res_h and res_c

def is_higher_ohlc_bar(current_bar, prev_bar): # Previously SUB (Simple Up Bar)
  """Checks if current_bar has higher Open, High, Low, Close (OHLC) compared to prev_bar.
     Higher low, higher high, higher close than prev_bar. (Open is not explicitly checked here but implied by "higher prices")
  """
  return (current_bar.l > prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c) # Using close, can be prev_bar.o

def is_low_then_higher_close_bar(current_bar, prev_bar): # Previously BRB (Bullish Reversal Bar)
  """Checks if current_bar has a lower low, but higher high and higher close than prev_bar.
  """
  return (current_bar.l < prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c)

def is_pending_downtrend_start_rule(current_bar, prev_bar):
    """Rule for Pending Downtrend Start (PDS) on prev_bar.
       Triggered by current_bar's close.
       1. current_bar did NOT make a higher high than prev_bar's high.
       2. current_bar closed BELOW prev_bar's open.
    """
    return (current_bar.h <= prev_bar.h and 
            current_bar.c < prev_bar.o)

def is_pending_uptrend_start_rule(current_bar, prev_bar):
    """Rule for Pending Uptrend Start (PUS) on prev_bar.
       Triggered by current_bar's close.
       1. current_bar did NOT make a lower low than prev_bar's low.
       2. current_bar closed ABOVE prev_bar's open.
    """
    return (current_bar.l >= prev_bar.l and
            current_bar.c > prev_bar.o)

def is_simple_pending_downtrend_start_signal(current_bar, prev_bar):
    """
    Simple rule for Pending Downtrend Start (PDS) signal.
    Signal on prev_bar if current_bar does not make a higher high than prev_bar.
    This is a basic condition often used in conjunction with other bar patterns.
    """
    return current_bar.h <= prev_bar.h

def is_simple_pending_uptrend_start_signal(current_bar, prev_bar):
    """
    Simple rule for Pending Uptrend Start (PUS) signal.
    Signal on prev_bar if current_bar does not make a lower low than prev_bar.
    This is a basic condition often used in conjunction with other bar patterns.
    """
    return current_bar.l >= prev_bar.l

def is_hhll_down_close_pattern(current_bar, prev_bar): # Renamed for clarity, same as check_cus_confirmation_higher_high_lower_low_down_close
    """
    Checks for Higher High, Lower Low, Down Close pattern.
    Pattern: Current bar is an "outside bar" relative to prev_bar (higher high AND lower low),
             and current_bar closes below its own open (a down-closing bar). 
    Args:
        current_bar (Bar): The bar being evaluated.
        prev_bar (Bar): The bar immediately preceding current_bar.
    Returns:
        bool: True if conditions are met, False otherwise.
    """
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l
    cond3_down_close = current_bar.c < current_bar.o 
    return cond1_higher_high and cond2_lower_low and cond3_down_close 