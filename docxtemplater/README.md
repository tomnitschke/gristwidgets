# Grist docxtemplater widget
_Based on https://github.com/stan-donarise/grist-docxtemplater-widget_

This integrates [docxtemplater](https://docxtemplater.com/) with [Grist](https://www.getgrist.com/).  
Use it in your Grist documents by adding a custom widget and setting its URL to: `https://tomnitschke.github.io/gristwidgets/docxtemplater/`

Once set up as a custom widget, it expects the following columns to be mapped:
* "Attachment ID": Int column giving the id of a Grist attachment record. This should point to the template DOCX document. The ID can be obtained within Grist by using a formula like this: `$TheAttachmentColumn.id[0]` (Note the `[0]` to use only the first attachment, should there be multiple. The widget can only handle one file at a time.)
* "Placeholder Data": Any-type column (note it _must_ be set to type "Any", not just to _any_ type!) holding a dictionary like this: `{ placeholderName: valueToReplaceBy }`. Docxtemplater will replace any occurences of `placeholderName` in the template DOCX document with the respective `valueToReplaceBy`.
* "Output File Name": Text column giving the name for the resulting file that will be offered for download once docxtemplater is done processing. This should include the ".docx" extension.

The following columns may be mapped optionally:
* "Use Angular Parser?": Bool column determining whether to enable the [Angular parser for advanced placeholder expressions](https://docxtemplater.com/docs/angular-parse/) or not.
* "Custom Delimiter: Start": Text column defining the starting/opening delimiter for placeholders. The default is `{`. (Note that if this is mapped but empty, the default will be used.)
* "Custom Delimiter: End": Text column defining the ending/closing delimiter for placeholders. The default is `}`. (Note that if this is mapped but empty, the default will be used.)

Additional notes:
* Any placeholders in the template document that aren't in the "Placeholder Data" dictionary (see above) won't be touched and will appear unchanged in the document.
