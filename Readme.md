# Articles Summarizer - Chrome Extension

Articles Summarizer is a powerful Chrome extension **that emphasizes RTL support**. It uses Google's Gemini AI to provide instant summaries of web pages. A floating button appears on the side of your screen, allowing you to get a concise summary of any article with a single click.

 <!-- Replace with a real screenshot URL -->

## Features

*   **One-Click Summaries**: Activate the summary with a convenient floating button on the right side of any web page.
*   **AI-Powered**: Leverages the Google Gemini API for high-quality, context-aware summaries.
*   **Customizable**: Requires you to use your own Google Gemini API key, giving you full control.
*   **Multi-Language Support**: Set a preferred language for your summaries (supports English, Hebrew, Arabic, etc...). with attention to RTL support.
*   **Modern UI**: Features a clean, modern, and encapsulated UI that doesn't conflict with website styles.

## Installation

Since this extension is not on the Chrome Web Store, you will need to load it manually in developer mode.

*   Clone this repository or download the source code as a ZIP file and unzip it.
*   Open Google Chrome and navigate to `chrome://extensions`.
*   In the top-right corner of the extensions page, toggle the "Developer mode" switch to **On**.
*   Click the "Load unpacked" button that appears.
*   In the file dialog, navigate to the folder where you unzipped the extension's source code (the folder containing `manifest.json`).
*   Select the folder to install the extension.

The "Articles Summarizer" extension icon should now appear in your Chrome toolbar.

## Configuration

Before you can use the extension, you must configure your API key.

1.  **Get a Google Gemini API Key**:
    *   Visit Google AI Studio to create and obtain your free API key.

2.  **Open Extension Options**:
    *   Right-click the "Articles Summarizer" icon in your Chrome toolbar and select "Options".
    *   Alternatively, go to the `chrome://extensions` page, find the extension, and click "Details", then "Extension options".

3.  **Save Your Settings**:
    *   Paste your Google Gemini API key into the "API Key" field.
    *   Select your "Preferred Language" from the dropdown menu.
    *   Click "Save Settings".

You are now ready to use the extension!

## How to Use

1.  Navigate to any article or web page you want to summarize.
2.  Hover over the floating button on the right edge of the screen.
3.  Click the button to generate the summary.
4.  A summary box will appear, showing a concise overview of the page content.
5.  To close the summary, click the '×' button or click anywhere outside the summary box.

## Contributing

Contributions are welcome! If you have ideas for improvements or find any bugs, feel free to open an issue or submit a pull request.

## License

This project is open-source. Feel free to use and modify it as you see fit.