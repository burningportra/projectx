class Bar:
    """Represents a single price bar (OHLC) with its timestamp and indices."""
    def __init__(self, date_str, o, h, l, c, original_file_line, chronological_index):
        """
        Initializes a Bar object.

        Args:
            date_str (str): The date/timestamp string.
            o (str_or_float): The opening price.
            h (str_or_float): The high price.
            l (str_or_float): The low price.
            c (str_or_float): The closing price.
            original_file_line (int): The original line number from the input file (for debugging).
            chronological_index (int): A 1-based index representing the bar\'s order in time.
        """
        self.date = date_str
        self.o = float(o)
        self.h = float(h)
        self.l = float(l)
        self.c = float(c)
        self.original_file_line = original_file_line # For debugging if needed
        self.index = int(chronological_index) # 1-based chronological index

    def __repr__(self):
        return (f"Bar({self.index}, D:{self.date} O:{self.o} H:{self.h} "
                f"L:{self.l} C:{self.c})") 