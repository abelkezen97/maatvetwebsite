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
2. Setup four columns in the first row (headers):
   * **Company** (Column A)
   * **Contact Name** (Column B)
   * **Location** (Column C)
   * **Pending Billwise Amount** (Column D)

### Step 2: Add Apps Script for Writing Customers
To allow the portal to add new customers from the web:
1. Inside your Customer Google Sheet, click **Extensions** > **Apps Script**.
2. Paste this code:

```javascript
function doGet(e) {
  try {
    var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = activeSpreadsheet.getSheets()[0];
    var action = e.parameter.action;

    // ACTION 1: Update Pending Balance for an existing customer
    if (action === "updatePending") {
      var targetCompany = (e.parameter.company || "").toLowerCase().trim();
      var amountToAdd = parseFloat(e.parameter.amountToAdd) || 0;
      var data = sheet.getDataRange().getValues();

      for (var i = 1; i < data.length; i++) {
        var sheetCompany = (data[i][0] || "").toString().toLowerCase().trim();
        if (sheetCompany === targetCompany) {
          var currentVal = parseFloat(data[i][3]) || 0;
          var newVal = Math.max(0, currentVal + amountToAdd); // Never drop below 0
          sheet.getRange(i + 1, 4).setValue(newVal); // Update Column D
          return ContentService.createTextOutput("Updated: " + newVal)
            .setMimeType(ContentService.MimeType.TEXT);
        }
      }
      return ContentService.createTextOutput("Customer not found").setMimeType(ContentService.MimeType.TEXT);
    }

    // ACTION 2: Append New Customer Row
    var company = e.parameter.company;
    var name = e.parameter.name;
    var location = e.parameter.location;
    var pendingAmount = e.parameter.pendingAmount || "0";

    if (company) {
      sheet.appendRow([company, name, location, pendingAmount]);
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

# 5. Receipts Apps Script Web App URL
GOOGLE_RECEIPTS_SCRIPT_URL="https://script.google.com/macros/s/.../exec"
```

---

## Part 4: Receipt Log & PDF Storage (Google Apps Script)

To automatically record issued payment receipts and upload generated PDF receipts directly into a Google Drive folder:

### Step 1: Create your Receipts Google Sheet
1. Open Google Sheets and create a new blank spreadsheet (Name it e.g. **"MAAT Customer Receipts"**).
2. Set up these columns in Row 1:
   * **Receipt Number** (Column A)
   * **Customer / Company** (Column B)
   * **Doctor Name** (Column C)
   * **Amount Paid** (Column D)
   * **Payment Date** (Column E)
   * **Payment Method** (Column F)
   * **Reference / Cheque No** (Column G)
   * **PDF Drive Link** (Column H)

### Step 2: Add Apps Script for Writing Receipts & Saving PDFs
1. Inside the Google Sheet, go to **Extensions** > **Apps Script**.
2. Replace all content with this script:

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = activeSpreadsheet.getSheets()[0];

    var receiptNumber = data.receiptNumber || "";
    var customerName = data.customerName || "";
    var companyName = data.companyName || "";
    var amountPaid = data.amountPaid || 0;
    var paymentDate = data.paymentDate || "";
    var paymentMethod = data.paymentMethod || "";
    var referenceNo = data.referenceNo || "";
    var fileName = data.fileName || ("MAAT-RECEIPT-" + receiptNumber + ".pdf");
    var pdfBase64 = data.pdfBase64 || "";

    var pdfUrl = "";

    // If PDF base64 string is provided, save it directly to Google Drive
    if (pdfBase64) {
      var decodedBlob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), "application/pdf", fileName);
      var file = DriveApp.createFile(decodedBlob);
      pdfUrl = file.getUrl();
    }

    // Append row to sheet
    sheet.appendRow([
      receiptNumber,
      companyName,
      customerName,
      amountPaid,
      paymentDate,
      paymentMethod,
      referenceNo,
      pdfUrl
    ]);

    return ContentService.createTextOutput(JSON.stringify({ success: true, pdfUrl: pdfUrl }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = activeSpreadsheet.getSheets()[0];
    var data = sheet.getDataRange().getValues();
    var receipts = [];

    for (var i = 1; i < data.length; i++) {
      if (data[i][0]) {
        receipts.push({
          id: "rec-" + i,
          receiptNumber: data[i][0].toString(),
          companyName: data[i][1].toString(),
          customerName: data[i][2].toString(),
          amountPaid: parseFloat(data[i][3]) || 0,
          paymentDate: data[i][4].toString(),
          paymentMethod: data[i][5].toString(),
          referenceNo: data[i][6] ? data[i][6].toString() : "",
          pdfUrl: data[i][7] ? data[i][7].toString() : ""
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify(receipts))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. Save the project (Click the 💾 icon).
4. Click **Deploy** > **New Deployment**.
5. Choose **Web app**.
6. Set **Execute as**: `Me` and **Who has access**: `Anyone`.
7. Click **Deploy**, authorize permissions if prompted, and copy the **Web App URL**.
8. Paste the Web App URL into your `.env.local` file as `GOOGLE_RECEIPTS_SCRIPT_URL`:
   ```env
   GOOGLE_RECEIPTS_SCRIPT_URL="your_copied_web_app_url_here"
   ```

