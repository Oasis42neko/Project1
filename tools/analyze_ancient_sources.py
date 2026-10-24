import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "package": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def read_workbook(path):
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", NS):
                shared.append("".join(node.text or "" for node in item.iter("{%s}t" % NS["main"])))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relation_map = {
            item.attrib["Id"]: item.attrib["Target"]
            for item in relationships.findall("package:Relationship", NS)
        }
        result = []
        for sheet in workbook.find("main:sheets", NS):
            target = relation_map[sheet.attrib["{%s}id" % NS["rel"]]]
            if not target.startswith("xl/"):
                target = "xl/" + target
            root = ET.fromstring(archive.read(target))
            rows = []
            for row in root.findall(".//main:sheetData/main:row", NS):
                values = {}
                for cell in row.findall("main:c", NS):
                    ref = cell.attrib.get("r", "")
                    match = re.match(r"[A-Z]+", ref)
                    if not match:
                        continue
                    column = match.group(0)
                    value = cell.find("main:v", NS)
                    text = "" if value is None else value.text or ""
                    if cell.attrib.get("t") == "s" and text:
                        text = shared[int(text)]
                    elif cell.attrib.get("t") == "inlineStr":
                        text = "".join(node.text or "" for node in cell.iter("{%s}t" % NS["main"]))
                    values[column] = text.strip()
                if values:
                    rows.append(values)
            result.append({"name": sheet.attrib.get("name", ""), "rows": rows})
        return result


def number(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def id_value(value):
    text = str(value or "").strip()
    return text if re.fullmatch(r"\d{17}", text) else ""


def main():
    old_path = r"D:\WeChat2\xwechat_files\wxid_oumcu86bjo8h22_9d76\msg\file\2026-08\全市古树名木名册20240120213502.xlsx"
    latest_path = r"D:\WeChat2\xwechat_files\wxid_oumcu86bjo8h22_9d76\msg\file\2026-08\潮州市古树名木202608.xlsx"
    old_rows = read_workbook(old_path)[0]["rows"]
    latest_rows = read_workbook(latest_path)[0]["rows"]

    old = {}
    old_statuses = {}
    for row in old_rows:
        tree_id = id_value(row.get("B"))
        if not tree_id:
            continue
        if tree_id in old:
            raise ValueError("Duplicate tree ID in coordinate workbook: " + tree_id)
        old[tree_id] = {
            "longitude": number(row.get("S")),
            "latitude": number(row.get("T")),
        }
        old_statuses[str(row.get("BC") or "")] = old_statuses.get(str(row.get("BC") or ""), 0) + 1

    latest = []
    latest_ids_seen = set()
    for row in latest_rows:
        tree_id = id_value(row.get("A"))
        if not tree_id:
            continue
        if tree_id in latest_ids_seen:
            raise ValueError("Duplicate tree ID in latest workbook: " + tree_id)
        latest_ids_seen.add(tree_id)
        coordinates = old.get(tree_id, {})
        longitude = coordinates.get("longitude")
        latitude = coordinates.get("latitude")
        if (longitude is None) != (latitude is None):
            longitude = None
            latitude = None
        if longitude is not None and not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            raise ValueError("Invalid coordinates for tree ID: " + tree_id)
        province = row.get("C", "")
        city = row.get("D", "")
        county = row.get("E", "")
        town = row.get("K", "")
        village = row.get("L", "")
        site = row.get("M", "")
        has_coordinates = longitude is not None and latitude is not None
        latest.append({
            "id": tree_id,
            "treeNo": tree_id,
            "species": row.get("F", ""),
            "latinName": row.get("I", ""),
            "alias": row.get("J", ""),
            "level": row.get("O", ""),
            "age": row.get("N", ""),
            "location": " - ".join(part for part in [province, city, county, town, village, site] if part),
            "province": province,
            "city": city,
            "county": county,
            "town": town,
            "village": village,
            "site": site,
            "family": row.get("G", ""),
            "genus": row.get("H", ""),
            "status": "located" if has_coordinates else "pending",
            "statusClass": "healthy" if has_coordinates else "watch",
            "longitude": longitude,
            "latitude": latitude,
            "note": row.get("P", ""),
            "image": "/assets/home/ancient-tree.jpg",
            "source": "ancient-trees-202608",
        })

    latest_ids = {item["id"] for item in latest}
    matched = latest_ids & set(old)
    with_coords = sum(1 for tree_id in matched if old[tree_id]["longitude"] is not None and old[tree_id]["latitude"] is not None)
    missing_coords = [tree_id for tree_id in latest_ids if old.get(tree_id, {}).get("longitude") is None or old.get(tree_id, {}).get("latitude") is None]

    existing_path = os.path.join(os.path.dirname(__file__), "..", "cloudfunctions", "quickstartFunctions", "data", "ancientTrees.json")
    with open(existing_path, "r", encoding="utf-8") as file:
        existing = json.load(file)
    existing_by_id = {str(item.get("id")): item for item in existing}

    if len(latest) != 2300:
        raise ValueError("Expected 2300 active records in the latest workbook, got %d" % len(latest))
    if set(existing_by_id) != latest_ids:
        raise ValueError("Latest workbook IDs differ from the existing restoration package; review before replacing it")

    with open(existing_path, "w", encoding="utf-8", newline="\n") as file:
        json.dump(latest, file, ensure_ascii=False, separators=(",", ":"))

    frontend_path = os.path.join(os.path.dirname(__file__), "..", "miniprogram", "data", "ancientTrees.json")
    with open(frontend_path, "w", encoding="utf-8", newline="\n") as file:
        json.dump(latest, file, ensure_ascii=False, separators=(",", ":"))

    report = {
        "oldRows": len(old),
        "latestRows": len(latest),
        "matchedIds": len(matched),
        "latestOnlyIds": len(latest_ids - set(old)),
        "oldOnlyIds": len(set(old) - latest_ids),
        "latestWithCoordinatesFromOld": with_coords,
        "latestWithoutCoordinatesFromOld": len(missing_coords),
        "missingCoordinateIds": sorted(missing_coords),
        "oldStatusCounts": old_statuses,
        "existingJsonRows": len(existing),
        "existingJsonIds": len(existing_by_id),
        "existingIdsMissingFromLatest": sorted(set(existing_by_id) - latest_ids),
        "existingIdsMissingFromOld": sorted(set(existing_by_id) - set(old)),
        "existingRowsWithCoordinates": sum(1 for item in existing if item.get("longitude") is not None and item.get("latitude") is not None),
        "outputRows": len(latest),
        "outputRowsWithCoordinates": sum(1 for item in latest if item["longitude"] is not None and item["latitude"] is not None),
        "outputRowsWithoutCoordinates": sum(1 for item in latest if item["longitude"] is None or item["latitude"] is None),
        "excludedOldOnlyIds": len(set(old) - latest_ids),
        "outputPath": os.path.abspath(existing_path),
    }
    output = os.path.join(os.environ.get("TEMP", "."), "ancient_sources_report.json")
    with open(output, "w", encoding="utf-8") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
    print(output)


if __name__ == "__main__":
    main()
