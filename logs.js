// logs.js
document.addEventListener("DOMContentLoaded", function() {
  localizeHtmlPage();
  chrome.storage.local.get("logsForReport", function(data) {
    if (data.logsForReport) {
      const logsTextArea = document.getElementById("logs");
      logsTextArea.value = data.logsForReport;
      chrome.storage.local.remove("logsForReport");
    }
  });
});

function localizeHtmlPage() {
  //Localize by replacing __MSG_***__ meta tags
  var objects = document.getElementsByTagName('html');
  for (var j = 0; j < objects.length; j++)
  {
      var obj = objects[j];

      var valStrH = obj.innerHTML.toString();
      var valNewH = valStrH.replace(/__MSG_(\w+)__/g, function(match, v1)
      {
          return v1 ? chrome.i18n.getMessage(v1) : "";
      });

      if(valNewH != valStrH)
      {
          obj.innerHTML = valNewH;
      }
  }
}
