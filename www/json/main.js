require(['ChainJSON.js',
        'jquery.min.js'], function(API) {
  var $ = window.$;

  var p;
  API.on('ready', function() {
    console.log('READY');
    $('#prop').attr('disabled', false);
    $('#value').attr('disabled', false);
    // Ability to change object values
    $('#send').click(function() {
      var prop = $('#prop').val();
      var value = $('#value').val();
      if(prop.trim() && value.trim()) {
        if(parseInt(value).toString() === value) {
          p[prop] = parseInt(value);
        }
        else if(parseFloat(value).toString() === value) {
          p[prop] = parseFloat(value);
        }
        else {
          p[prop] = value;
        }
      }
    });
    // Get the current value of the proxy
    $('#getvalue').click(function(){
      console.log(p);
      alert(JSON.stringify(p));
    });
  });
  
  API.on('change', function(oldObj, newObj) {
    console.log("old: " + oldObj + '  new: ' + newObj);
  });

  var options = {};
  p = API.getCollaborativeObject(options);
  
  
  
  
  
  
});