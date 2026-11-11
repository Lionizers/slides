<Content title="Two diagrams side by side">
  <Diagram>
    <Lane title="Today">
      <Box color="violet" name="Server" tags={['Website', 'API', 'Jobs']} />
      <Connector to={2} label="SQL" />
      <Row>
        <Box color="steel" name="Database" tags={['Users', 'Orders']} />
        <Box color="teal" name="File storage" tags={['Images', 'PDFs']} />
      </Row>
    </Lane>
    <Lane title="Tomorrow">
      <Box variant="accent" color="gold" name="API service" tags={['API', 'Jobs']} highlight={['Cache']} />
      <Connector label="SQL" />
      <Row width="half">
        <Box color="steel" name="Database" tags={['Users', 'Orders']} />
      </Row>
    </Lane>
  </Diagram>
</Content>
