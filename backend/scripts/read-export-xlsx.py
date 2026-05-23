import openpyxl
import json

path = r"C:\Users\oyoge\Desktop\next js standalone\policies-export-23 05 2026.xlsx"
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
headers = [str(h).strip() if h is not None else "" for h in rows[0]]
print("HEADER_COUNT", len(headers))
for i, h in enumerate(headers):
    print(f"{i+1}\t{h}")
if len(rows) > 1:
    sample = rows[1]
    print("\nSAMPLE_ROW")
    for i, (h, v) in enumerate(zip(headers, sample)):
        if v not in (None, ""):
            print(f"{h}\t{v}")
