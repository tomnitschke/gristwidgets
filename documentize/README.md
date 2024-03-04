# Documentize Widget for Grist
This is a widget for [Grist](https://www.getgrist.com) that turns HTML or Markdown text into a DOCX or PDF document and then offers it up for download.

To use, add a custom widget and set its URL to `https://tomnitschke.github.io/gristwidgets/documentize`.  
Then map a column of type "Text" or "Choice" containing your HMTL or Markdown. Unless specified (see below), this will be assumed to be HTML by default.
(Of course, you can also insert and link Grist's Markdown widget to be able to edit this comfortably.)

Additionally, these optional columns may be mapped:

* "Filename": "Text" or "Choice" type column defining the name of the output file. Should include the ".docx" or ".pdf" extension. If you don't map this column, a random name will be generated.
* "Source Type": "Text"/"Choice" column specifying whether the input is HMTL or Markdown. Correspondingly, allowable values are: "html", "markdown". Any illegal value will be interpreted as "html".
* "Preview Enabled?": "Bool" column defining whether to show a document preview to the user (which is the default). If this is false, users will only see a status message and the "Process!" button on the widget.
* "Custom Config for Googoose": "Any" column providing custom configuration for the Googoose library. Must be provided as a dictionary like '{ optionName: optionValue }'. See https://github.com/aadel112/googoose?tab=readme-ov-file#options for more information.
* "Custom Config for html2pdf": As above, but for the html2pdf library. See https://github.com/eKoopmans/html2pdf.js?tab=readme-ov-file#options for more information.
* "Output Format": "Text" or "Choice" type column defining the output file format. Allowed values are "docx" or "pdf". If this is empty or not mapped, users will be able to select which format they want.

## Inserting Images from Attachments
The widget supports inserting images from external URLs as well as from your Grist attachments. For the latter, just provide `attachment:n` instead of a URL for the image, where "n" is a valid attachment ID. See [here](https://github.com/tomnitschke/gristwidgets/blob/main/viewerjs/README.md) for examples of how to obtain one.

## Known Limitation for PDFs
The library used renders HTML to canvas, then canvas to PDF. As a result, you'll get a PDF that effectively consists of just an image, so you won't be able to select text and the file won't be searchable. See [here](https://github.com/eKoopmans/html2pdf.js?tab=readme-ov-file#known-issues) for details. There is nothing I can do about this, unless there's a better HTML to PDF library out there that I don't know of. Of course, you can always just convert to DOCX, then save as PDF from within Word.
