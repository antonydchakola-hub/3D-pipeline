# 3D Model Pipeline Detailed Overview

*(Note: The column mappings and logic detailed below are derived strictly from the executable code instructions, intentionally ignoring any inaccurate or outdated comments found in the source files.)*

This document details the exact Google Apps Script-based workflow for a 3D model production pipeline. The pipeline tracks the lifecycle of 3D assets through four primary stages—**Manager**, **Modelling**, **Texturing**, and **Lighting**—using interconnected Google Sheets.

## System Architecture & Universal Settings

### Isolated Project Pipelines (Sheet Tabs)
The pipeline manages multiple projects concurrently by utilizing identical tab names across all four master sheets. For example, if an asset is dispatched from the "Testing" tab in the Manager Sheet, the code explicitly targets the "Testing" tab in the Modelling Sheet using `getSheetByName(hubSheet.getName())`. 

This sandboxing ensures that assets from the "Testing" project never mix with assets from the "C6_2026" project, maintaining strict isolation as they move down the pipeline. If a corresponding tab doesn't exist in the receiving stage, the script has a fallback to target the leftmost sheet (index `0`) to prevent failure, though matching tab names is the expected convention.

### Core Master Sheets
The pipeline relies on specific Google Sheets IDs to communicate and sync data:
- **Manager Sheet**: Central dashboard for dispatching tasks and tracking overall progress.
- **Modelling Sheet**: The first stage of production.
- **Texturing Sheet**: The second stage of production.
- **Lighting Sheet**: The final stage of production and QA.

**Concurrency Lock System**: All workflow sheets (Modelling, Texturing, Lighting) reserve **Column P (Column 16)** as a Token Lock. When a row is being processed, this column is set to `"PROCESSED"`. The script checks this column and will exit if it finds it, preventing race conditions or duplicate triggers if multiple users edit simultaneously.

**Universal Production Sheet Mapping**:
When assets move between stages (Modelling -> Texturing -> Lighting) or when they are duplicated for rework/splitting, a universal mapping is applied matching the `MAP` configuration in the code:
- **Column A (1)**: No (ID)
- **Column B (2)**: TCN (Target Control Number)
- **Column C (3)**: Comments
- **Column D (4)**: Type (e.g., "new", "rework")
- **Column E (5)**: Priority
- **Column F (6)**: Complexity
- **Column G (7)**: Allotted Date / Allotment

Other standard tracked columns in production sheets (based on their exact numerical indices in code):
- **Column I (9)**: Assigned Artist
- **Column J (10)**: Current Status
- **Column K (11)**: Allocated Time
- **Column L (12)**: Time Spent
- **Column M (13)**: Rework Time

---

## 1. Manager Stage (`Manager.txt`)
The Manager sheet acts as the starting point of the pipeline where tasks are allocated and dispatched to the team.

### Layout & Tracking Columns (Derived from Code Execution):
- **Col A (0-indexed as 0)**: Checkboxes for Dispatch
- **Col B (Index 1)**: No.
- **Col C (Index 2)**: TCIN
- **Col D (Index 3)**: Priority
- **Col E (Index 4)**: Allotted Date
- **Col H (Col 8)**: Mod Artist Name
- **Col I (Col 9)**: Mod Status
- **Col J (Col 10)**: Text Artist Name
- **Col K (Col 11)**: Text Status
- **Col L (Col 12)**: QA / Lighting Artist Name
- **Col M (Col 13)**: Upload Date
- **Col N (Col 14)**: Main / Overall Status
- **Col O (Col 15)**: Approved Date
- **Col P (Col 16)**: Mod Rework Counter
- **Col Q (Col 17)**: Text Rework Counter
- **Col R (Col 18)**: Light Rework Counter

### Features:
- **Dispatch Logic (`syncSelectedRowsToModeling`)**:
  - Scans for rows where the checkbox in **Column A** is checked.
  - Pulls essential asset data from **Columns B, C, D, and E**.
  - Appends a new row to the Modelling sheet matching the universal layout on the identical Project Tab. It assigns the TCIN to **Column B**, forces the Type (**Column D**) to `"new"`, leaves Complexity (Col F) entirely blank, and explicitly zeroes out Columns H, I, and J.
  - Automatically unchecks the processed checkboxes in **Column A**.

---

## 2. Modelling Stage (`Modelling.txt`)
The Modelling stage handles the creation of the 3D asset and begins the process of tracking time and status.

### Features:
- **Cleanup Tool**: A custom menu to delete rows where "Time Taken" (**Column L (12)**) is exactly 0.
- **Workflow Trigger**: Listens for edits on **Column I (9) (Artist)** or **Column J (10) (Status)**.
  
### Status Transitions (Column J):
- **Artist Update Only (Col I edit)**: The script updates the Manager sheet's Mod Artist (**Column H (8)**) quietly on the corresponding Project Tab.
- **Done**: Looks at the Texturing Sheet (matching Project Tab) to see if the TCN already exists. If yes, it pushes it as a "rework", otherwise "new". Updates current sheet status to `"Sent to Texturing"`.
- **Rework**: Duplicates the row at the bottom of the current Modelling sheet with Type "rework". Archives the current row as `"Archived Rework"`. Increments the Manager sheet's Mod Rework counter in **Column P (16)**.
- **Split**: Duplicates the row, appending a hyphen `"-"` to the TCN (**Column B (2)**) to create a sub-asset, forces Type to `"new"`, and archives the current row as `"Archived Split"`.
- **Split Done**: Deliberately halts without passing the row down the pipeline.

---

## 3. Texturing Stage (`Texturing.txt`)
The Texturing stage receives assets from Modelling and handles the material application phase.

### Features:
- **Workflow Trigger**: Listens for edits on **Column J (10) (Status)**.

### Status Transitions (Column J):
- **Done**: Appends the row to the Lighting Sheet (matching Project Tab), and updates the current row's status to `"Sent to Lighting"`. Updates Manager sheet Text Status (**Col K (11)**) to "Done".
- **Rework (Modelling)**: Prompts for a feedback comment. Duplicates the row back into the Modelling Sheet (matching Project Tab) with the comment in **Column C (3)**. Increments the Mod Rework counter (**Col P (16)**) in the Manager Sheet. **Code Note:** It explicitly clears the Text Status in the Manager Sheet back to an empty string. Archives current row.
- **Rework (Texturing)**: Prompts for a comment, duplicates the row within the Texturing Sheet itself for internal fixes. Increments the Text Rework counter (**Col Q (17)**) in the Manager Sheet. Archives current row.
- **Split / Split Done**: Functions identically to the Modelling stage.

---

## 4. Lighting Stage (`Lighting.txt`)
The final stage involves rendering, lighting, and QA approval before finalizing the asset.

### Features:
- **Workflow Trigger**: Listens for edits on **Column J (10) (Status)**.

### Status Transitions (Column J):
- **Uploaded**: Updates the Manager Sheet's Main Status (**Col N (14)**) to "Uploaded" and stamps the current date in Upload Date (**Col M (13)**) on the matching Project Tab.
- **Approved**: Updates the Manager Sheet's Main Status to "Approved" and stamps the current date in Approved Date (**Col O (15)**).
- **Rework (Modelling)**: Prompts for comment, sends back to Modelling. Increments Manager Mod Rework Counter **Col P (16)**. **Code Note:** It explicitly clears the Main Status (**Col N**), Upload Date (**Col M**), and Text Status (**Col K**) in the Manager Sheet, effectively resetting the pipeline's progress markers.
- **Rework (Texturing)**: Prompts for comment, sends back to Texturing. Increments Manager Text Rework Counter **Col Q (17)**. **Code Note:** Clears the Main Status (**Col N**) and Upload Date (**Col M**) in the Manager Sheet, while preserving Mod Status.
- **Rework (Lighting)**: Prompts for comment, duplicates row in Lighting for internal fixes. Increments Manager Light Rework Counter **Col R (18)**. **Code Note:** Sets Main Status to "Rework" and clears Upload Date (**Col M**).
