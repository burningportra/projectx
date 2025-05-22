import pandas as pd
import json
import sys # For command-line arguments
import argparse # For better argument parsing

# Define file paths (can be overridden by command-line arguments)
DEFAULT_DETECTED_SIGNALS_PATH = 'logs/detected_signals_history.csv'
DEFAULT_REFERENCE_SIGNALS_PATH = 'trend_analysis/confirmed_trend_starts_4h.csv'

def parse_detected_signals(csv_text_segment):
    # Normalize line endings
    if '\\n' not in csv_text_segment and '\n' in csv_text_segment:
        lines = csv_text_segment.strip().split('\n')
    else:
        lines = csv_text_segment.strip().split('\\n') # Original uses \\n for escaped newlines in a string

    signals = []
    for line_num, raw_line_with_comment in enumerate(lines):
        line_sans_comment = raw_line_with_comment.split('#')[0].strip()
        if not line_sans_comment:
            continue

        # Basic header check for detected signals
        # Looks for typical column names in the first line.
        if line_num == 0 and ('analyzer_id' in line_sans_comment and 'signal_type' in line_sans_comment and 'details' in line_sans_comment):
            print(f"Skipping detected signals header: {line_sans_comment}")
            continue
        
        parts = line_sans_comment.split(',')
        
        potential_json_start_col = -1
        # Iterate from right to left to find the start of the JSON, assuming it's the last complex field.
        # A common pattern is that the JSON details part starts with `"{""` or just `{"`.
        for i in range(len(parts) - 1, -1, -1):
            field_segment = ",".join(parts[i:])
            # Clean the field for checking (remove CSV quotes, unescape internal quotes)
            cleaned_segment = field_segment
            if field_segment.startswith('"') and field_segment.endswith('"'):
                cleaned_segment = field_segment[1:-1].replace('""', '"')
            else:
                cleaned_segment = field_segment.replace('""', '"')

            if cleaned_segment.startswith('{') and '"confirmed_signal_bar_index"' in cleaned_segment:
                potential_json_start_col = i
                break
        
        if potential_json_start_col == -1:
            # Fallback: search from left if the right-to-left failed (e.g. malformed JSON or simple line)
            for i in range(len(parts)):
                current_concatenated_for_search = ",".join(parts[i:])
                temp_field_cleaned = current_concatenated_for_search
                if temp_field_cleaned.startswith('"') and temp_field_cleaned.endswith('"'):
                     temp_field_cleaned = temp_field_cleaned[1:-1].replace('""','"')
                else:
                     temp_field_cleaned = temp_field_cleaned.replace('""','"')

                if temp_field_cleaned.startswith('{') and '"confirmed_signal_bar_index"' in temp_field_cleaned:
                    potential_json_start_col = i
                    break
            
        if potential_json_start_col == -1:
            print(f"Could not reliably find JSON start in: {line_sans_comment}")
            continue

        timestamp_idx = 1 # Assuming 'timestamp' is the second field
        signal_type_idx = 5 # Assuming 'signal_type' is the sixth field

        if len(parts) <= signal_type_idx or potential_json_start_col == -1 or potential_json_start_col >= len(parts):
            print(f"Line does not have enough parts for expected fields or JSON: {line_sans_comment}")
            continue
            
        try:
            timestamp_str = parts[timestamp_idx].strip()
            signal_type_str = parts[signal_type_idx].strip()
            
            json_part_combined = ",".join(parts[potential_json_start_col:])
            details_str = json_part_combined
            if details_str.startswith('"') and details_str.endswith('"'): # CSV field quoting
                details_str = details_str[1:-1]
            
            details_str = details_str.replace('""', '"') # Unescape "" to " for JSON
            
            details = json.loads(details_str)
            confirmed_bar_index = details.get("confirmed_signal_bar_index")
            
            trend_type = None
            if signal_type_str == "uptrend_start":
                trend_type = "uptrend"
            elif signal_type_str == "downtrend_start":
                trend_type = "downtrend"
            
            if confirmed_bar_index is not None and trend_type is not None:
                signals.append({
                    "bar_index": int(confirmed_bar_index),
                    "trend_type": trend_type,
                    "timestamp": timestamp_str,
                    "raw_line": raw_line_with_comment 
                })
        except json.JSONDecodeError as e:
            print(f"JSONDecodeError for line: {raw_line_with_comment}\n  Attempting to parse details_str: '{details_str}'. Error: {e}")
        except IndexError:
            print(f"IndexError while parsing line (not enough parts?): {line_sans_comment}")
        except Exception as e:
            print(f"Generic error parsing line: {raw_line_with_comment}. Error: {e}")
            
    signals.sort(key=lambda x: (x["bar_index"], 0 if x["trend_type"] == "downtrend" else 1))
    return signals

def parse_reference_signals(csv_text):
    if '\\n' not in csv_text and '\n' in csv_text: # File read
        lines = csv_text.strip().split('\n')
    else: # String literal with escaped newlines
        lines = csv_text.strip().split('\\n') # Ensured this is indented under else
        
    signals = []
    for line_num, line in enumerate(lines):
        if line_num == 0 and "trend_type,bar_index,date" in line: # Header check
            print(f"Skipping reference signals header: {line}")
            continue
        if not line.strip():
            continue
        parts = line.split(',')
        if len(parts) < 2: # trend_type,bar_index are minimum
            print(f"Skipping malformed line in reference signals: {line}")
            continue
        
        trend_type_str = parts[0].strip()
        bar_index_str = parts[1].strip()
        
        try:
            signals.append({
                "bar_index": int(bar_index_str),
                "trend_type": trend_type_str,
                "raw_line": line
            })
        except ValueError:
            print(f"ValueError converting bar_index '{bar_index_str}' to int in reference line: {line}")

    signals.sort(key=lambda x: (x["bar_index"], 0 if x["trend_type"] == "downtrend" else 1))
    return signals

def main(detected_signals_path, reference_signals_path, skip_detected_n, skip_reference_n):
    try:
        with open(detected_signals_path, 'r', encoding='utf-8') as f:
            detected_signals_csv_content = f.read()
    except FileNotFoundError:
        print(f"Error: Detected signals file not found at {detected_signals_path}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading detected signals file {detected_signals_path}: {e}")
        sys.exit(1)

    try:
        with open(reference_signals_path, 'r', encoding='utf-8') as f:
            reference_signals_csv_content = f.read()
    except FileNotFoundError:
        print(f"Error: Reference signals file not found at {reference_signals_path}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading reference signals file {reference_signals_path}: {e}")
        sys.exit(1)

    parsed_detected = parse_detected_signals(detected_signals_csv_content)
    parsed_reference = parse_reference_signals(reference_signals_csv_content)
    
    if skip_detected_n > 0 and len(parsed_detected) > skip_detected_n:
        print(f"Skipping first {skip_detected_n} detected signals.")
        parsed_detected = parsed_detected[skip_detected_n:]
    elif skip_detected_n > 0:
        print(f"Warning: Tried to skip {skip_detected_n} detected signals, but only {len(parsed_detected)} were loaded.")

    if skip_reference_n > 0 and len(parsed_reference) > skip_reference_n:
        print(f"Skipping first {skip_reference_n} reference signals.")
        parsed_reference = parsed_reference[skip_reference_n:]
    elif skip_reference_n > 0:
        print(f"Warning: Tried to skip {skip_reference_n} reference signals, but only {len(parsed_reference)} were loaded.")

    # Deduplicate detected signals before comparison, as the finder might log multiple triggers for the same trend start on a bar
    unique_detected_signals = []
    seen_detected_keys = set()
    for sig in parsed_detected:
        key = (sig["bar_index"], sig["trend_type"])
        if key not in seen_detected_keys:
            seen_detected_keys.add(key)
            unique_detected_signals.append(sig)

    print(f"Comparing Detected signals from '{detected_signals_path}' vs. Reference signals from '{reference_signals_path}':")
    print(f"Total unique detected signals loaded after deduplication: {len(unique_detected_signals)}")
    print(f"Total reference signals loaded: {len(parsed_reference)}")

    if not unique_detected_signals and not parsed_reference:
        print("Both signal lists are empty. Nothing to compare.")
        return
    if not unique_detected_signals:
        print("Detected signals list is empty. Cannot compare.")
        return
    if not parsed_reference:
        print("Reference signals list is empty. Cannot compare.")
        return

    mismatches_found = 0
    d_idx, r_idx = 0, 0
    comparison_count = 0

    while d_idx < len(unique_detected_signals) and r_idx < len(parsed_reference):
        detected = unique_detected_signals[d_idx]
        reference = parsed_reference[r_idx]
        comparison_count +=1
    
        match = (detected["bar_index"] == reference["bar_index"] and 
                 detected["trend_type"] == reference["trend_type"])
             
        if not match:
            print(f"\nMISMATCH FOUND (Comparison attempt #{comparison_count}):")
            print(f"  Detected : Bar {detected['bar_index']}, Type: {detected['trend_type']} (From line: {detected['raw_line'][:150]}...)")
            print(f"  Reference: Bar {reference['bar_index']}, Type: {reference['trend_type']} (From line: {reference['raw_line'][:150]}...)")
            mismatches_found += 1
            
            print("\n  Context - Detected (around detected item):")
            for j in range(max(0, d_idx-2), min(len(unique_detected_signals), d_idx+3)):
                prefix = "    >> " if j == d_idx else "       "
                print(f"{prefix}Idx {unique_detected_signals[j]['bar_index']}, Type: {unique_detected_signals[j]['trend_type']}")
                
            print("\n  Context - Reference (around reference item):")
            for j in range(max(0, r_idx-2), min(len(parsed_reference), r_idx+3)):
                prefix = "    >> " if j == r_idx else "       "
                print(f"{prefix}Idx {parsed_reference[j]['bar_index']}, Type: {parsed_reference[j]['trend_type']}")
            break 
        
        d_idx += 1
        r_idx += 1

    if mismatches_found == 0:
        if d_idx < len(unique_detected_signals): 
            print(f"\nPARTIAL MATCH: All {comparison_count} compared signals match, but Detected has MORE signals ({len(unique_detected_signals) - d_idx} extra).")
            print("Next detected signal(s):")
            for i in range(d_idx, min(d_idx + 3, len(unique_detected_signals))):
                 print(f"  Bar {unique_detected_signals[i]['bar_index']}, Type: {unique_detected_signals[i]['trend_type']}")
        elif r_idx < len(parsed_reference): 
            print(f"\nPARTIAL MATCH: All {comparison_count} compared signals match, but Reference has MORE signals ({len(parsed_reference) - r_idx} extra).")
            print("Next reference signal(s):")
            for i in range(r_idx, min(r_idx + 3, len(parsed_reference))):
                 print(f"  Bar {parsed_reference[i]['bar_index']}, Type: {parsed_reference[i]['trend_type']}")
        else:
            print(f"\nPERFECT MATCH! All {comparison_count} signals match between the two files.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Compare detected trend signals with reference signals.')
    parser.add_argument('detected_path', nargs='?', default=DEFAULT_DETECTED_SIGNALS_PATH,
                        help=f'Path to the detected signals CSV file (default: {DEFAULT_DETECTED_SIGNALS_PATH})')
    parser.add_argument('reference_path', nargs='?', default=DEFAULT_REFERENCE_SIGNALS_PATH,
                        help=f'Path to the reference signals CSV file (default: {DEFAULT_REFERENCE_SIGNALS_PATH})')
    parser.add_argument('--skip-detected', type=int, default=0,
                        help='Number of initial records to skip from the detected signals list.')
    parser.add_argument('--skip-reference', type=int, default=0,
                        help='Number of initial records to skip from the reference signals list.')

    args = parser.parse_args()

    # Handle old positional argument style if no optional args are given first
    # or if only paths are provided.
    if not any(arg.startswith('--') for arg in sys.argv[1:]):
        if len(sys.argv) >= 3:
            args.detected_path = sys.argv[1]
            args.reference_path = sys.argv[2]
            print(f"Using provided positional paths (style 1): Detected='{args.detected_path}', Reference='{args.reference_path}'")
        elif len(sys.argv) == 2:
             args.detected_path = sys.argv[1]
             print(f"Using provided positional path (style 1): Detected='{args.detected_path}', Reference='{args.reference_path}'")
    elif (len(sys.argv) > 1 and not sys.argv[1].startswith('--')):
        args.detected_path = sys.argv[1]
        if len(sys.argv) > 2 and not sys.argv[2].startswith('--'):
            args.reference_path = sys.argv[2]
        print(f"Using inferred positional paths (style 2): Detected='{args.detected_path}', Reference='{args.reference_path}'")
    else:
        print(f"Using default or flag-specified paths: Detected='{args.detected_path}', Reference='{args.reference_path}'")

    print(f"Skip Detected: {args.skip_detected}, Skip Reference: {args.skip_reference}")
    main(args.detected_path, args.reference_path, args.skip_detected, args.skip_reference)
