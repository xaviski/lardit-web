"""Retrieve official SCB teacher salaries; no credentials or third-party packages."""
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://api.scb.se/OV0104/v1/doris/en/ssd/START/AM/AM0110/AM0110A/"


def retrieve(table):
    url = BASE + table
    with urlopen(url, timeout=40) as response:
        metadata = json.load(response)
    selections = {"Region": ["SE"], "Sektor": ["0"], "Yrke2012": ["2341"], "Kon": ["1+2"]}
    for variable in metadata["variables"]:
        if variable["code"] == "ContentsCode":
            selections["ContentsCode"] = [variable["values"][variable["valueTexts"].index("Monthly salary")]]
        if variable["code"] == "Tid":
            selections["Tid"] = variable["values"]
    payload = {"query": [{"code": key, "selection": {"filter": "item", "values": values}}
                          for key, values in selections.items()], "response": {"format": "json"}}
    request = Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=40) as response:
        result = json.load(response)
    year_index = [column["code"] for column in result["columns"] if column["type"] != "c"].index("Tid")
    rows = [{"year": int(row["key"][year_index]), "monthly_sek": int(row["values"][0]), "source": url}
            for row in result["data"]]
    return rows, result.get("comments", []), payload


if __name__ == "__main__":
    rows, comments, queries = [], [], {}
    for table in ("LonYrkeRegion4A", "LonYrkeRegion4AN"):
        observations, notes, query = retrieve(table)
        rows.extend(observations)
        comments.extend(notes)
        queries[table] = query
    output = {
        "retrieved": "2026-11-12",
        "measure": "Average gross monthly salary, full-time equivalent, current SEK",
        "occupation": "2341 Primary school teachers (SSYK 2012); Sweden compulsory school, broader than Catalan primary",
        "coverage": "Sweden, all sectors, both sexes; observed workforce, not a statutory base-pay scale or fixed cohort",
        "notes": ["SSYK classification changed in 2014: do not splice pre-2014 occupation series.",
                  "AID classification updates in 2018; SCB advises caution for year comparisons.",
                  "SCB publishes 2014–2022 and 2023–2025 in separate tables; private-sector sampling and changes in workforce composition affect year comparisons.",
                  "No 2026 annual observation available at retrieval. Nominal amounts; not adjusted for inflation."],
        "rows": sorted(rows, key=lambda row: row["year"]), "queries": queries, "source_comments": comments,
    }
    path = ROOT / "assets/data/professorat/salaris-suecia.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output["rows"], ensure_ascii=True))
