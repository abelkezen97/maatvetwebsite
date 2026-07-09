# Connecting Google Sheets & Forms (No Google Cloud Required)

This guide provides instructions to connect the MAAT Sales Portal directly to Google Sheets using Google Forms and Apps Script Web Apps.

---

## Part 1: Product Catalog Setup (Sheet & Form)

### Step 1: Create your Google Form
1. Go to [Google Forms](https://forms.google.com) and create a new form.
2. Add two fields in this exact order:
   * **Medicine Name** (Short Answer / Text)
   * **Unit Price** (Short Answer / Text)

### Step 2: Link the Form to a Google Sheet
1. In your Google Form editor, go to the **Responses** tab.
2. Click the green **Link to Sheets** button.
3. This creates a Google Sheet with columns:
   `Timestamp` | `Medicine Name` | `Unit Price`

### Step 3: Publish the Sheet to Web (For Reading)
1. Open the linked Google Sheet.
2. Go to **File** > **Share** > **Publish to web**.
3. Select **Entire Document** and click **Publish**.
4. Copy the **Spreadsheet ID** from the sheet's browser URL bar:
   `https://docs.google.com/spreadsheets/d/`**`YOUR_SPREADSHEET_ID_HERE`**`/edit#gid=0`

---

## Part 2: Customer List Setup (Sheet & Apps Script)

To allow the Sales Portal to read and add new customers dynamically:

### Step 1: Create your Customer Google Sheet
1. Create a brand new Google Sheet.
2. Setup three columns in the first row (headers):
   * **Company** (Column A)
   * **Contact Name** (Column B)
   * **Location** (Column C)

### Step 2: Add Apps Script for Writing Customers
To allow the portal to add new customers from the web:
1. Inside your Customer Google Sheet, click **Extensions** > **Apps Script**.
2. Paste this code:

```javascript
function doGet(e) {
  try {
    var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = activeSpreadsheet.getSheets()[0];
    
    var company = e.parameter.company;
    var name = e.parameter.name;
    var location = e.parameter.location;
    
    if (company) {
      // Append new customer row matching Column A, B, C structure
      sheet.appendRow([company, name, location]);
      
      return ContentService.createTextOutput("Success")
        .setMimeType(ContentService.MimeType.TEXT);
    } else {
      return ContentService.createTextOutput("Error: Missing company name")
        .setMimeType(ContentService.MimeType.TEXT);
    }
  } catch (error) {
    return ContentService.createTextOutput("Error: " + error.toString())
      .setMimeType(ContentService.MimeType.TEXT);
  }
}
```
3. Click the **Save** icon.
4. Click **Deploy** > **New Deployment**.
5. Select **Web app** as the type.
6. Configure:
   * **Execute as**: `Me`
   * **Who has access**: `Anyone`
7. Click **Deploy**, copy the generated **Web App URL**, and paste it as `GOOGLE_CUSTOMERS_SCRIPT_URL` in your environment variables.

### Step 3: Publish Customer Sheet to Web (For Reading)
1. Inside the Customer Google Sheet, go to **File** > **Share** > **Publish to web**.
2. Click **Publish**.
3. Copy the **Customers Spreadsheet ID** from the browser URL:
   `https://docs.google.com/spreadsheets/d/`**`YOUR_CUSTOMERS_SPREADSHEET_ID_HERE`**`/edit#gid=0`

---

## Part 3: Configure Environment Variables

Create or open the file **`.env.local`** in the root directory of the project and configure these values:

```env
# 1. Product Catalog Spreadsheet ID
NEXT_PUBLIC_SPREADSHEET_ID="your_product_spreadsheet_id"

# 2. Customers Directory Spreadsheet ID
NEXT_PUBLIC_CUSTOMERS_SPREADSHEET_ID="your_customers_spreadsheet_id"

# 3. Customer Apps Script Web App URL (From Part 2 Step 2)
GOOGLE_CUSTOMERS_SCRIPT_URL="https://script.google.com/macros/s/.../exec"

# 4. Quotes Apps Script Web App URL
GOOGLE_QUOTES_SCRIPT_URL="https://script.google.com/macros/s/.../exec"
```
