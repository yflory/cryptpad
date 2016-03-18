require(['ChainJSON.js',
        'jquery.min.js'], function(API) {
  var $ = window.$;
  var options = {
    onReady : function() {
      $('#prop').attr('disabled', false);
      $('#value').attr('disabled', false);
    }
  };
  API.register({}, options).then(function(p) {
    
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
    
    $('#getvalue').click(function(){
      console.log(p);
      alert(JSON.stringify(p));
      
    });
    
  });;
  
  
  
  
  
  
  
});