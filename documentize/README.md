# Documentize Widget for Grist
This is a widget for [Grist](https://www.getgrist.com) that turns HTML or Markdown text into DOCX documents and then offers these up for download.

To use, add a custom widget and set its URL to `https://tomnitschke.github.io/gristwidgets/documentize`.  
Then map a column of type "Text" or "Choice" containing your HMTL or Markdown. Unless specified (see below), this will be assumed to be HTML by default.
(Of course, you can also insert and link Grist's Markdown widget to be able to edit this comfortably.)

Additionally, these optional columns may be mapped:

* "Filename": "Text" or "Choice" type column defining the name of the output file. Should include the ".docx" extension. If you don't map this column, a random name will be generated.
* "Source Type": "Text"/"Choice" column specifying whether the input is HMTL or Markdown. Correspondingly, allowable values are: "html", "markdown". Any illegal value will be interpreted as "html".
* "Preview Enabled?": "Bool" column defining whether to show a document preview to the user (which is the default). If this is false, users will only see a status message and the "Process!" button on the widget.
* "Custom Config": "Any" column providing custom configuration for the Googoose library. Must be provided as a dictionary like '{ optionName: optionValue }'. See https://github.com/aadel112/googoose?tab=readme-ov-file#options for more information.

## Inserting Images from Attachments
The widget supports inserting images from external URLs as well as from your Grist attachments. For the latter, just provide `attachment:n` instead of a URL for the image, where "n" is a valid attachment ID. See [here](https://github.com/tomnitschke/gristwidgets/blob/main/viewerjs/README.md) for examples of how to obtain one.
